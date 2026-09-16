import {
  errorMessage,
  getFallbackChain,
  isRetryableError,
  MAX_RETRIES_PER_AGENT,
} from "../agents/fallback.js";
import { runAgent } from "../agents/router.js";
import { describeAgent } from "../agents/selector.js";
import type { AgentCandidate } from "../agents/types.js";
import type { Task, TaskAttempt } from "./types.js";

export type AgentExecutor = (
  prompt: string,
  agent: AgentCandidate,
) => Promise<string>;

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

export async function runTask(
  task: Task,
  execute: AgentExecutor = runAgent,
): Promise<Task> {
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
  console.log();

  const attempts: TaskAttempt[] = [];
  let lastError: string | undefined;

  // Limitación conocida: Codex y Claude pueden modificar archivos. Si un agente
  // falla tras escribir parcialmente, el siguiente candidato puede encontrarse
  // esos cambios. El aislamiento (git worktrees) se implementará más adelante.
  for (const [index, candidate] of chain.entries()) {
    const label = describeAgent(candidate);
    console.log(`[${index + 1}/${chain.length}] ${label}`);

    for (let attempt = 0; attempt <= MAX_RETRIES_PER_AGENT; attempt++) {
      const startedAt = new Date();
      console.log(`Intento ${attempt + 1}`);

      try {
        const output = await execute(buildPrompt(running), candidate);

        attempts.push({
          agent: candidate,
          attempt: attempt + 1,
          startedAt,
          finishedAt: new Date(),
          status: "success",
        });

        console.log(`✓ Completada\n`);
        console.log(`${running.id} → DONE`);

        return {
          ...running,
          status: "done",
          executedBy: candidate,
          output,
          attempts,
          finishedAt: new Date(),
        };
      } catch (error) {
        const message = errorMessage(error);
        lastError = message;

        attempts.push({
          agent: candidate,
          attempt: attempt + 1,
          startedAt,
          finishedAt: new Date(),
          status: "failed",
          error: message,
        });

        console.log(`✗ Falló: ${message}`);

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

  return {
    ...running,
    status: "failed",
    error: lastError ?? "Ningún candidato pudo completar la tarea.",
    attempts,
    finishedAt: new Date(),
  };
}
