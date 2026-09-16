import { runAgent } from "../agents/router.js";
import { describeAgent, resolveAgent } from "../agents/selector.js";
import type { Task } from "./types.js";

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

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

export async function runTask(task: Task): Promise<Task> {
  if (task.status !== "ready") {
    throw new Error(
      `La tarea ${task.id} no se puede ejecutar (estado actual: ${task.status}). Se esperaba "ready".`,
    );
  }

  const selectedAgent = resolveAgent(task);

  const running: Task = {
    ...task,
    status: "running",
    executedBy: selectedAgent,
    startedAt: new Date(),
  };

  console.log(`▶ ${running.id} - ${running.title}`);
  console.log(`Tipo: ${running.type}`);
  console.log(`Complejidad: ${running.complexity}`);
  console.log(`Agente seleccionado: ${describeAgent(selectedAgent)}`);

  try {
    const output = await runAgent(buildPrompt(running), selectedAgent);

    console.log(`✓ ${running.id} completada`);

    return {
      ...running,
      status: "done",
      output,
      finishedAt: new Date(),
    };
  } catch (error) {
    console.log(`✗ ${running.id} falló`);

    return {
      ...running,
      status: "failed",
      error: errorMessage(error),
      finishedAt: new Date(),
    };
  }
}
