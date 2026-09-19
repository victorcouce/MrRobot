import { classifyAvailability } from "../agents/availability.js";
import { errorMessage, getFallbackChain } from "../agents/fallback.js";
import { describeAgent } from "../agents/selector.js";
import type { AgentCandidate } from "../agents/types.js";
import { runTask } from "../tasks/runner.js";
import type { Task } from "../tasks/types.js";
import { getReadyTasks, updateTaskStatuses } from "./dependencies.js";
import type { PlanResult, PlanStatus } from "./types.js";
import { validatePlan } from "./validation.js";

export interface RunPlanOptions {
  executeTask?: (task: Task) => Promise<Task>;
  concurrency?: number;
  /**
   * Tope de la concurrencia adaptativa. Si se define y es mayor que
   * `concurrency`, el plan arranca en `concurrency` y ajusta al alza/baja según
   * los resultados de cada lote. Sin definir, la concurrencia es fija.
   */
  maxConcurrency?: number;
  shouldPause?: () => boolean | Promise<boolean>;
  signal?: AbortSignal;
  onUpdate?: (tasks: Task[]) => void | Promise<void>;
  /** Agentes permitidos del chat de cada tarea, para previsualizar la cadena. */
  allowedAgentsFor?: (task: Task) => AgentCandidate[] | undefined;
  /** Notifica cada cambio de concurrencia (para eventos/UI y tests). */
  onConcurrencyChange?: (concurrency: number) => void;
}

const DEFAULT_CONCURRENCY = 2;

function resolveConcurrency(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_CONCURRENCY;
  }

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      `concurrency debe ser un entero mayor o igual a 1 (recibido: ${value}).`,
    );
  }

  return value;
}

function resolveMaxConcurrency(
  value: number | undefined,
  start: number,
): number {
  if (value === undefined) {
    return start;
  }

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      `maxConcurrency debe ser un entero mayor o igual a 1 (recibido: ${value}).`,
    );
  }

  return Math.max(value, start);
}

/**
 * Ajusta la concurrencia tras *cada* tarea que termina:
 * - Si el agente se agotó por disponibilidad (cuota, rate limit, auth o CLI
 *   ausente), se reduce a la mitad para no insistir.
 * - Si la tarea terminó bien, se sube de uno en uno hasta el tope.
 *
 * Antes esto se decidía por lote; al despachar de forma continua ya no hay
 * lotes, así que la señal es la propia tarea.
 */
function nextConcurrency(
  current: number,
  max: number,
  finished: Task,
): number {
  const availabilityHit =
    finished.status === "failed" &&
    finished.error !== undefined &&
    !classifyAvailability(finished.error).available;

  if (availabilityHit) {
    return Math.max(1, Math.floor(current / 2));
  }

  if (finished.status === "done" && current < max) {
    return current + 1;
  }

  return current;
}

function cloneTasks(tasks: Task[]): Task[] {
  return tasks.map((task) => ({ ...task }));
}

function logChanges(before: Task[], after: Task[]): void {
  const previous = new Map(before.map((task) => [task.id, task]));

  for (const task of after) {
    const prior = previous.get(task.id);
    const statusChanged = prior?.status !== task.status;
    const reasonChanged = prior?.blockedReason !== task.blockedReason;

    if (!statusChanged && !reasonChanged) {
      continue;
    }

    if (statusChanged) {
      console.log(`${task.id} → ${task.status.toUpperCase()}`);

      if (task.status === "blocked" && task.blockedReason) {
        console.log(`  ${task.blockedReason}`);
      }
    } else if (task.blockedReason) {
      console.log(`${task.id}: ${task.blockedReason}`);
    }
  }
}

function buildResult(
  status: PlanStatus,
  tasks: Task[],
  startedAt: Date,
): PlanResult {
  const failedTaskIds = tasks
    .filter((task) => task.status === "failed")
    .map((task) => task.id);
  const blockedTaskIds = tasks
    .filter((task) => task.status === "blocked")
    .map((task) => task.id);

  const result: PlanResult = {
    status,
    tasks,
    startedAt,
    finishedAt: new Date(),
  };

  if (failedTaskIds.length > 0) {
    result.failedTaskIds = failedTaskIds;
  }

  if (blockedTaskIds.length > 0) {
    result.blockedTaskIds = blockedTaskIds;
  }

  return result;
}

function previewAgent(task: Task, allowed: AgentCandidate[]): string {
  const first = getFallbackChain(task, allowed)[0];
  return first ? describeAgent(first) : "?";
}

function toResult(
  task: Task,
  outcome: PromiseSettledResult<Task>,
  batchStartedAt: Date,
): Task {
  const finishedAt = new Date();

  if (outcome.status === "rejected") {
    return {
      ...task,
      status: "failed",
      startedAt: task.startedAt ?? batchStartedAt,
      finishedAt,
      error: errorMessage(outcome.reason),
    };
  }

  const value = outcome.value;

  if (
    value.status !== "done" &&
    value.status !== "failed" &&
    value.status !== "blocked"
  ) {
    return {
      ...value,
      status: "failed",
      startedAt: value.startedAt ?? batchStartedAt,
      finishedAt,
      error: "runTask devolvió un estado inesperado.",
    };
  }

  const result: Task = { ...value };

  if (!result.startedAt) {
    result.startedAt = batchStartedAt;
  }

  if (!result.finishedAt) {
    result.finishedAt = finishedAt;
  }

  return result;
}

/**
 * Ejecuta el plan despachando tareas de forma continua: en cuanto una termina
 * se recalculan las dependencias y el hueco libre se ocupa con la siguiente
 * tarea lista, sin esperar a que acaben sus compañeras.
 *
 * La versión anterior trabajaba por lotes (`Promise.all` sobre `concurrency`
 * tareas): una tarea lenta dejaba los demás huecos parados hasta que terminaba,
 * y las tareas que dependían de una ya completada no arrancaban hasta el final
 * del lote. Con planes reales —donde una tarea puede tardar minutos y otra
 * segundos— ese tiempo muerto era la mayor parte del retraso del plan.
 */
export async function runPlan(
  tasks: Task[],
  options: RunPlanOptions = {},
): Promise<PlanResult> {
  let concurrency = resolveConcurrency(options.concurrency);
  const maxConcurrency = resolveMaxConcurrency(
    options.maxConcurrency,
    concurrency,
  );
  validatePlan(tasks);

  const executeTask = options.executeTask ?? runTask;
  const startedAt = new Date();

  const initial = cloneTasks(tasks);
  let current = updateTaskStatuses(initial);
  await options.onUpdate?.(current);

  console.log(`\nPLAN STARTED`);
  console.log(`Concurrency: ${concurrency}\n`);
  console.log(`${current.length} tareas\n`);
  logChanges(initial, current);

  /** Promesas en vuelo, por id de tarea. Nunca rechazan. */
  const inFlight = new Map<string, Promise<void>>();
  let stopping: "paused" | "cancelled" | undefined;

  const dispatch = (task: Task): void => {
    const taskStartedAt = new Date();

    current = current.map((entry) =>
      entry.id === task.id
        ? {
            ...entry,
            status: "running" as const,
            startedAt: entry.startedAt ?? taskStartedAt,
          }
        : entry,
    );

    const allowed = options.allowedAgentsFor?.(task) ?? [];
    console.log(`\n→ ${task.id} [${previewAgent(task, allowed)}]`);

    const pending = (async () => {
      let outcome: PromiseSettledResult<Task>;

      try {
        outcome = { status: "fulfilled", value: await executeTask(task) };
      } catch (reason) {
        outcome = { status: "rejected", reason };
      }

      const result = toResult(task, outcome, taskStartedAt);

      current = current.map((entry) =>
        entry.id === result.id ? result : entry,
      );

      console.log(
        `${result.id} ${result.status === "done" ? "✓ DONE" : `✗ ${result.status.toUpperCase()}`}`,
      );

      const adjusted = nextConcurrency(concurrency, maxConcurrency, result);

      if (adjusted !== concurrency) {
        console.log(
          `Concurrencia ${adjusted > concurrency ? "↑" : "↓"} ${concurrency} → ${adjusted}`,
        );
        concurrency = adjusted;
        options.onConcurrencyChange?.(concurrency);
      }

      // Recalcular aquí —y no al final de un lote— es lo que permite que las
      // tareas que dependían de esta arranquen de inmediato.
      const beforeRecalc = current;
      current = updateTaskStatuses(current);
      await options.onUpdate?.(current);
      logChanges(beforeRecalc, current);

      // Se saca del mapa al final, con la tarea ya contabilizada y las
      // dependencias recalculadas: mientras siga ahí, el bucle sabe que aún
      // queda trabajo y no da el plan por terminado.
      inFlight.delete(task.id);
    })();

    inFlight.set(task.id, pending);
  };

  while (true) {
    if (!stopping) {
      if (options.shouldPause && (await options.shouldPause())) {
        stopping = "paused";
      } else if (options.signal?.aborted) {
        stopping = "cancelled";
      }
    }

    if (!stopping) {
      const ready = getReadyTasks(current).filter(
        (task) => !inFlight.has(task.id),
      );

      // `concurrency` puede haber bajado con tareas aún en vuelo; entonces no
      // se despacha nada nuevo hasta que el pool vuelva por debajo del tope.
      let dispatched = 0;

      for (const task of ready) {
        if (inFlight.size >= concurrency) break;
        dispatch(task);
        dispatched += 1;
      }

      if (dispatched > 0) {
        await options.onUpdate?.(current);
      }
    }

    if (inFlight.size > 0) {
      // Espera a la *primera* que termine, no a todas: ahí se libera el hueco.
      await Promise.race(inFlight.values());
      continue;
    }

    // Los `await` del bucle ceden el control, así que una tarea puede haber
    // terminado —y desbloqueado a otras— mientras tanto. Sin esta relectura el
    // plan se daría por bloqueado teniendo tareas listas.
    if (!stopping && getReadyTasks(current).length > 0) {
      continue;
    }

    if (stopping === "paused") {
      console.log(`\nPLAN PAUSED`);
      return buildResult("paused", current, startedAt);
    }

    if (stopping === "cancelled") {
      console.log(`\nPLAN CANCELLED`);
      return buildResult("cancelled", current, startedAt);
    }

    if (current.every((task) => task.status === "done")) {
      const done = current.filter((task) => task.status === "done").length;
      console.log(`\nPLAN COMPLETED`);
      console.log(`${done}/${current.length} tareas`);
      return buildResult("completed", current, startedAt);
    }

    // Sin nada en vuelo y sin tareas listas: el plan no puede avanzar más.
    const hasFailed = current.some((task) => task.status === "failed");
    const status: PlanStatus = hasFailed ? "failed" : "blocked";

    console.log(`\n${status === "failed" ? "PLAN FAILED" : "PLAN BLOCKED"}`);
    return buildResult(status, current, startedAt);
  }
}
