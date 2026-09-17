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
  shouldPause?: () => boolean | Promise<boolean>;
  signal?: AbortSignal;
  onUpdate?: (tasks: Task[]) => void | Promise<void>;
  /** Agentes permitidos del chat de cada tarea, para previsualizar la cadena. */
  allowedAgentsFor?: (task: Task) => AgentCandidate[] | undefined;
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

export async function runPlan(
  tasks: Task[],
  options: RunPlanOptions = {},
): Promise<PlanResult> {
  const concurrency = resolveConcurrency(options.concurrency);
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

  while (true) {
    if (current.every((task) => task.status === "done")) {
      const done = current.filter((task) => task.status === "done").length;
      console.log(`\nPLAN COMPLETED`);
      console.log(`${done}/${current.length} tareas`);
      return buildResult("completed", current, startedAt);
    }

    if (options.shouldPause && (await options.shouldPause())) {
      console.log(`\nPLAN PAUSED`);
      return buildResult("paused", current, startedAt);
    }

    if (options.signal?.aborted) {
      console.log(`\nPLAN CANCELLED`);
      return buildResult("cancelled", current, startedAt);
    }

    const ready = getReadyTasks(current);

    if (ready.length === 0) {
      const hasFailed = current.some((task) => task.status === "failed");
      const status: PlanStatus = hasFailed ? "failed" : "blocked";

      console.log(`\n${status === "failed" ? "PLAN FAILED" : "PLAN BLOCKED"}`);
      return buildResult(status, current, startedAt);
    }

    const selected = ready.slice(0, concurrency);
    const batchStartedAt = new Date();
    const selectedIds = new Set(selected.map((task) => task.id));

    current = current.map((task) =>
      selectedIds.has(task.id)
        ? {
            ...task,
            status: "running" as const,
            startedAt: task.startedAt ?? batchStartedAt,
          }
        : task,
    );
    await options.onUpdate?.(current);

    console.log(`\nREADY:`);
    ready.forEach((task) => console.log(task.id));

    console.log(`\nStarting batch:`);
    selected.forEach((task) => {
      const allowed = options.allowedAgentsFor?.(task) ?? [];
      console.log(`→ ${task.id} [${previewAgent(task, allowed)}]`);
    });

    const results = new Map<string, Task>();

    await Promise.all(
      selected.map(async (task) => {
        let outcome: PromiseSettledResult<Task>;

        try {
          outcome = { status: "fulfilled", value: await executeTask(task) };
        } catch (reason) {
          outcome = { status: "rejected", reason };
        }

        results.set(task.id, toResult(task, outcome, batchStartedAt));
        current = current.map((entry) => results.get(entry.id) ?? entry);
        await options.onUpdate?.(current);
      }),
    );

    console.log();
    selected.forEach((task) => {
      const result = results.get(task.id);

      if (result) {
        console.log(
          `${result.id} ${result.status === "done" ? "✓ DONE" : "✗ FAILED"}`,
        );
      }
    });

    console.log(`\nRecalculating dependencies...\n`);

    const beforeRecalc = current;
    current = updateTaskStatuses(current);
    await options.onUpdate?.(current);
    logChanges(beforeRecalc, current);
  }
}
