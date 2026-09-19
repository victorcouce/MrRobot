import { relative } from "node:path";
import { renderAttachments } from "../agents/attachments.js";
import { classifyAvailability } from "../agents/availability.js";
import {
  errorMessage,
  getFallbackChain,
  isRetryableError,
  MAX_RETRIES_PER_AGENT,
} from "../agents/fallback.js";
import { runAgent } from "../agents/router.js";
import {
  isLimitReason,
  limitRetryDelayMs,
  resolveLimitRetry,
  sleep,
  type LimitRetryPolicy,
} from "../agents/limit-retry.js";
import { canWriteFiles, describeAgent } from "../agents/selector.js";
import type { AgentCandidate, Attachment } from "../agents/types.js";
import type { RunOptions } from "../providers/types.js";
import { gitWorkspaceManager } from "../workspace/manager.js";
import type { TaskWorkspace, WorkspaceManager } from "../workspace/types.js";
import type { Task, TaskAttempt } from "./types.js";

export type AgentExecutor = (
  prompt: string,
  agent: AgentCandidate,
  options?: RunOptions,
) => Promise<string>;

export interface RunTaskOptions {
  execute?: AgentExecutor | undefined;
  workspace?: WorkspaceManager | undefined;
  baseRef?: string | undefined;
  /**
   * Punto de partida del worktree. Por defecto `baseRef`; en los ciclos de fix
   * apunta al commit del intento anterior para que el agente continúe ese trabajo.
   */
  startRef?: string | undefined;
  extraPrompt?: string | undefined;
  maxRetriesPerAgent?: number | undefined;
  /** Reintento de la cadena completa cuando todos caen por límite. */
  limitRetry?: Partial<LimitRetryPolicy> | undefined;
  /** Agentes permitidos del chat. Vacío o ausente = sin restricción. */
  allowedAgents?: AgentCandidate[] | undefined;
  /** Adjuntos que la tarea referencia, ya resueltos. */
  attachments?: Attachment[] | undefined;
  signal?: AbortSignal | undefined;
  /** Recibe la salida del agente en vivo (stdout/stderr). */
  onOutput?: ((chunk: string) => void) | undefined;
  /**
   * Se ejecuta en el worktree del intento exitoso, antes de eliminarlo. Sirve
   * para correr los checks allí y reutilizar el `node_modules` que el agente ya
   * haya instalado, evitando un worktree y una instalación extra. `changed`
   * indica si el intento escribió algo: sin cambios no hay nada que verificar.
   */
  onWorkspaceSuccess?:
    | ((workspace: TaskWorkspace, changed: boolean) => Promise<void> | void)
    | undefined;
}

function buildPrompt(task: Task, attachments: Attachment[]): string {
  const criteria = task.acceptanceCriteria ?? [];

  const criteriaBlock =
    criteria.length > 0
      ? `\n\nCRITERIOS DE ACEPTACIÓN\n${criteria.map((item) => `- ${item}`).join("\n")}`
      : "";

  const attachmentsBlock =
    attachments.length > 0
      ? `\n${renderAttachments(attachments, { refs: false }).join("\n")}`
      : "";

  return `Eres un agente ejecutor dentro de un sistema multiagente.

TAREA
ID: ${task.id}

Título: ${task.title}

DESCRIPCIÓN
${task.description}${criteriaBlock}${attachmentsBlock}

Completa exclusivamente esta tarea.

Devuelve un resultado claro y directamente utilizable.`;
}

function failTask(
  task: Task,
  attempts: TaskAttempt[],
  error: string,
): Task {
  return {
    ...task,
    status: "failed",
    error,
    attempts,
    finishedAt: new Date(),
  };
}

interface TaskRunOutcome {
  task: Task;
  /** Todos los candidatos cayeron por límite del proveedor (rate/usage). */
  allLimited: boolean;
  limitError?: unknown;
}

/**
 * Ejecuta una tarea con reintento automático cuando *todos* los agentes de la
 * cadena se agotan por límite. Entre reintentos espera el `retry after` del
 * proveedor o un backoff exponencial.
 */
export async function runTask(
  task: Task,
  options: RunTaskOptions = {},
): Promise<Task> {
  const limitRetry = resolveLimitRetry(options.limitRetry);
  const carry: { attempts: TaskAttempt[]; workspaceAttempt: number } = {
    attempts: [],
    workspaceAttempt: 0,
  };

  for (let cycle = 0; ; cycle++) {
    const outcome = await runTaskOnce(task, options, carry);

    if (
      outcome.task.status === "done" ||
      !outcome.allLimited ||
      cycle >= limitRetry.maxLimitRetries
    ) {
      return outcome.task;
    }

    const delay = limitRetryDelayMs(cycle, outcome.limitError, limitRetry);
    console.log(
      `⏳ todos los agentes al límite; reintentando la cadena en ${Math.round(delay / 1000)}s (${cycle + 1}/${limitRetry.maxLimitRetries}).`,
    );

    try {
      await sleep(delay, options.signal);
    } catch (error) {
      return failTask(outcome.task, carry.attempts, errorMessage(error));
    }
  }
}

async function runTaskOnce(
  task: Task,
  options: RunTaskOptions,
  carry: { attempts: TaskAttempt[]; workspaceAttempt: number },
): Promise<TaskRunOutcome> {
  const execute = options.execute ?? runAgent;
  const workspaceManager = options.workspace ?? gitWorkspaceManager;
  const maxRetries = options.maxRetriesPerAgent ?? MAX_RETRIES_PER_AGENT;

  if (task.status !== "ready") {
    throw new Error(
      `La tarea ${task.id} no se puede ejecutar (estado actual: ${task.status}). Se esperaba "ready".`,
    );
  }

  const fullChain = getFallbackChain(task, options.allowedAgents ?? []);

  // Las tareas de código solo las pueden completar agentes que escriben en el
  // worktree. Si hay al menos uno disponible, se descartan los que solo
  // devuelven texto (DeepSeek) para no gastar una llamada ni ensuciar el
  // resultado. Si la restricción del chat solo deja agentes de texto, se
  // conserva la cadena y el guard de "sin cambios" dará el error explicativo.
  const chain =
    task.type === "coding" && fullChain.some(canWriteFiles)
      ? fullChain.filter(canWriteFiles)
      : fullChain;

  const basePrompt = buildPrompt(task, options.attachments ?? []);
  const prompt = options.extraPrompt
    ? `${basePrompt}\n\n${options.extraPrompt}`
    : basePrompt;

  const running: Task = {
    ...task,
    status: "running",
    startedAt: new Date(),
  };

  // Un reintento parte de cero: el error/bloqueo de la ejecución anterior no
  // debe sobrevivir a un resultado exitoso (la UI lo mostraría como fallo).
  delete running.error;
  delete running.blockedReason;
  delete running.integrationError;

  console.log(`▶ ${running.id} - ${running.title}`);
  console.log(`Tipo: ${running.type}`);
  console.log(`Complejidad: ${running.complexity}`);
  console.log(`\nCadena:`);
  chain.forEach((candidate, index) => {
    console.log(`${index + 1}. ${describeAgent(candidate)}`);
  });

  let repoRoot: string;
  let baseRef: string;

  try {
    repoRoot = await workspaceManager.getRepoRoot();
    baseRef = options.baseRef ?? (await workspaceManager.resolveBaseRef());
  } catch (error) {
    const message = errorMessage(error);
    console.log(`✗ No se pudo preparar el aislamiento: ${message}`);
    return { task: failTask(running, [], message), allLimited: false };
  }

  console.log(`\nBase commit:\n${baseRef}`);

  if (await workspaceManager.isDirty()) {
    console.log(`\nAviso: el repositorio principal tiene cambios sin commit.`);
    console.log(
      `Esos cambios NO forman parte del workspace (base ${baseRef.slice(0, 7)}).`,
    );
  }

  const startRef = options.startRef ?? baseRef;

  if (startRef !== baseRef) {
    console.log(`\nContinuando desde el intento anterior:\n${startRef}`);
  }

  const attempts = carry.attempts;
  let lastError: string | undefined;
  let allLimited = chain.length > 0;
  let limitError: unknown;

  for (const [index, candidate] of chain.entries()) {
    if (options.signal?.aborted) {
      return {
        task: failTask(running, attempts, "Ejecución cancelada por el usuario."),
        allLimited: false,
      };
    }

    const label = describeAgent(candidate);
    console.log(`\n[${index + 1}/${chain.length}] ${label}`);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (options.signal?.aborted) {
        return {
          task: failTask(running, attempts, "Ejecución cancelada por el usuario."),
          allLimited: false,
        };
      }

      carry.workspaceAttempt += 1;
      const startedAt = new Date();

      let workspace;
      try {
        workspace = await workspaceManager.create(
          running.id,
          carry.workspaceAttempt,
          startRef,
        );
      } catch (error) {
        const message = errorMessage(error);
        console.log(`✗ No se pudo crear el workspace: ${message}`);

        attempts.push({
          agent: candidate,
          attempt: attempt + 1,
          startedAt,
          finishedAt: new Date(),
          status: "failed",
          error: message,
          baseRef,
        });

        return {
          task: failTask(running, attempts, message),
          allLimited: false,
        };
      }

      if (workspace.path === repoRoot) {
        throw new Error(
          `Aislamiento inválido: el cwd del agente no puede ser la raíz del repositorio (${running.id}).`,
        );
      }

      console.log(`\nCreando workspace:\n${relative(repoRoot, workspace.path)}`);
      console.log(`Branch:\n${workspace.branchName}`);
      console.log(`Agente:\n${label}`);
      console.log(`Intento ${attempt + 1}`);

      try {
        const output = await execute(prompt, candidate, {
          cwd: workspace.path,
          ...(options.signal ? { signal: options.signal } : {}),
          ...(options.onOutput ? { onOutput: options.onOutput } : {}),
        });

        const commitMessage = `agent(${running.id}): ${running.title}`;
        const committed = await workspaceManager.commit(workspace, commitMessage);

        // Una tarea de código sin cambios no ha hecho su trabajo, ni en el
        // primer intento ni en los ciclos de fix. Ocurre, por ejemplo, con
        // proveedores que solo devuelven texto (DeepSeek) y no escriben en el
        // worktree. Sin esto, un ciclo de fix daría por buena la tarea con el
        // commit del intento anterior y el reviewer compararía el informe del
        // agente con un diff que no le corresponde.
        if (running.type === "coding" && committed === undefined) {
          throw new Error(
            `${label} no creó ni modificó ningún archivo en el workspace. ` +
              `Los proveedores que solo devuelven texto (DeepSeek) no escriben en disco; ` +
              `usa Codex o Claude para tareas de código.`,
          );
        }

        // En los ciclos de fix el worktree parte del commit anterior: se aplana
        // el árbol final en un único commit sobre la base de integración, para
        // que el cherry-pick de la tarea siga siendo un solo commit.
        let resultCommit = committed;

        if (startRef !== baseRef) {
          if (committed !== undefined) {
            resultCommit = await workspaceManager.squash(
              workspace,
              baseRef,
              commitMessage,
            );
          } else {
            // Tarea no-code sin cambios nuevos: se conserva el trabajo del
            // intento anterior, pero el commit no es de este agente.
            resultCommit = startRef;
          }
        }

        if (options.onWorkspaceSuccess) {
          await options.onWorkspaceSuccess(workspace, committed !== undefined);
        }

        await workspaceManager.remove(workspace, {
          deleteBranch: committed === undefined,
        });

        const attemptRecord: TaskAttempt = {
          agent: candidate,
          attempt: attempt + 1,
          startedAt,
          finishedAt: new Date(),
          status: "success",
          workspacePath: workspace.path,
          branchName: workspace.branchName,
          baseRef,
        };

        // Solo se atribuye el commit al intento si este lo produjo. En un
        // ciclo de fix sin cambios, `resultCommit` es el commit anterior (de
        // otro agente) y no debe figurar como trabajo de este intento.
        if (committed !== undefined) {
          attemptRecord.commitSha = resultCommit ?? committed;
        }

        attempts.push(attemptRecord);

        console.log(`\n✓ tarea completada`);

        if (resultCommit !== undefined) {
          console.log(`Commit:\n${resultCommit}`);
        } else {
          console.log(`Sin cambios que commitear (no se creó commit).`);
        }

        console.log(`\n${running.id} → DONE`);

        const done: Task = {
          ...running,
          status: "done",
          executedBy: candidate,
          output,
          attempts,
          finishedAt: new Date(),
        };

        if (resultCommit !== undefined) {
          done.resultCommit = resultCommit;
        }

        return { task: done, allLimited: false };
      } catch (error) {
        const message = errorMessage(error);
        lastError = message;

        await workspaceManager.remove(workspace, { deleteBranch: true });

        attempts.push({
          agent: candidate,
          attempt: attempt + 1,
          startedAt,
          finishedAt: new Date(),
          status: "failed",
          error: message,
          workspacePath: workspace.path,
          branchName: workspace.branchName,
          baseRef,
        });

        console.log(`✗ intento fallido: ${message}`);
        console.log(`Limpiando workspace...`);

        const availability = classifyAvailability(error);

        if (!availability.available) {
          if (isLimitReason(availability.reason)) {
            limitError = error;
          } else {
            allLimited = false;
          }
          console.log(
            `Agente no disponible (${availability.reason}), se pasa al siguiente candidato.`,
          );
          break;
        }

        // Cualquier fallo que no sea límite descarta el reintento de cadena.
        allLimited = false;

        if (!isRetryableError(error)) {
          console.log(`Error no reintentable, se pasa al siguiente candidato.`);
          break;
        }

        if (attempt < maxRetries) {
          console.log(`\nRetry ${label}\n`);
        }
      }
    }

    const next = chain[index + 1];

    if (next) {
      console.log(`\nFallback → ${describeAgent(next)}\n`);
    }
  }

  console.log(`${running.id} → FAILED`);

  return {
    task: failTask(
      running,
      attempts,
      lastError ?? "Ningún candidato pudo completar la tarea.",
    ),
    allLimited,
    ...(limitError !== undefined ? { limitError } : {}),
  };
}
