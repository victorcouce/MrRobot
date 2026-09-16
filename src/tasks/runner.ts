import { relative } from "node:path";
import {
  errorMessage,
  getFallbackChain,
  isRetryableError,
  MAX_RETRIES_PER_AGENT,
} from "../agents/fallback.js";
import { runAgent } from "../agents/router.js";
import { describeAgent } from "../agents/selector.js";
import type { AgentCandidate } from "../agents/types.js";
import type { RunOptions } from "../providers/types.js";
import { gitWorkspaceManager } from "../workspace/manager.js";
import type { WorkspaceManager } from "../workspace/types.js";
import type { Task, TaskAttempt } from "./types.js";

export type AgentExecutor = (
  prompt: string,
  agent: AgentCandidate,
  options?: RunOptions,
) => Promise<string>;

export interface RunTaskOptions {
  execute?: AgentExecutor;
  workspace?: WorkspaceManager;
}

function buildPrompt(task: Task): string {
  return `Eres un agente ejecutor dentro de un sistema multiagente.

TAREA
ID: ${task.id}

Título: ${task.title}

DESCRIPCIÓN
${task.description}

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

export async function runTask(
  task: Task,
  options: RunTaskOptions = {},
): Promise<Task> {
  const execute = options.execute ?? runAgent;
  const workspaceManager = options.workspace ?? gitWorkspaceManager;

  if (task.status !== "ready") {
    throw new Error(
      `La tarea ${task.id} no se puede ejecutar (estado actual: ${task.status}). Se esperaba "ready".`,
    );
  }

  const chain = getFallbackChain(task);

  const running: Task = {
    ...task,
    status: "running",
    startedAt: new Date(),
  };

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
    baseRef = await workspaceManager.resolveBaseRef();
  } catch (error) {
    const message = errorMessage(error);
    console.log(`✗ No se pudo preparar el aislamiento: ${message}`);
    return failTask(running, [], message);
  }

  console.log(`\nBase commit:\n${baseRef}`);

  if (await workspaceManager.isDirty()) {
    console.log(`\nAviso: el repositorio principal tiene cambios sin commit.`);
    console.log(
      `Esos cambios NO forman parte del workspace (base ${baseRef.slice(0, 7)}).`,
    );
  }

  const attempts: TaskAttempt[] = [];
  let lastError: string | undefined;
  let workspaceAttempt = 0;

  for (const [index, candidate] of chain.entries()) {
    const label = describeAgent(candidate);
    console.log(`\n[${index + 1}/${chain.length}] ${label}`);

    for (let attempt = 0; attempt <= MAX_RETRIES_PER_AGENT; attempt++) {
      workspaceAttempt += 1;
      const startedAt = new Date();

      let workspace;
      try {
        workspace = await workspaceManager.create(
          running.id,
          workspaceAttempt,
          baseRef,
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

        return failTask(running, attempts, message);
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
        const output = await execute(buildPrompt(running), candidate, {
          cwd: workspace.path,
        });

        const commitSha = await workspaceManager.commit(
          workspace,
          `agent(${running.id}): ${running.title}`,
        );

        await workspaceManager.remove(workspace, {
          deleteBranch: commitSha === undefined,
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

        if (commitSha !== undefined) {
          attemptRecord.commitSha = commitSha;
        }

        attempts.push(attemptRecord);

        console.log(`\n✓ tarea completada`);

        if (commitSha !== undefined) {
          console.log(`Commit:\n${commitSha}`);
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

        if (commitSha !== undefined) {
          done.resultCommit = commitSha;
        }

        return done;
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

        if (!isRetryableError(error)) {
          console.log(`Error no reintentable, se pasa al siguiente candidato.`);
          break;
        }

        if (attempt < MAX_RETRIES_PER_AGENT) {
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

  return failTask(
    running,
    attempts,
    lastError ?? "Ningún candidato pudo completar la tarea.",
  );
}
