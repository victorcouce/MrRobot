import assert from "node:assert/strict";
import { test } from "node:test";
import { askTaskAgent } from "./instructions.js";
import type { Task } from "./types.js";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "TASK-001",
    title: "Implementar parser",
    description: "Crear un parser de expresiones.",
    status: "failed",
    type: "coding",
    complexity: "medium",
    error: "review no aprobado",
    ...overrides,
  };
}

test("instructions: proceed cuando el agente acepta la instrucción", async () => {
  const outcome = await askTaskAgent(
    makeTask(),
    [],
    "usa una gramática en vez de regex",
    {
      execute: async () =>
        JSON.stringify({
          action: "proceed",
          message: "Cambiaré a un parser basado en gramática.",
        }),
      maxAttempts: 1,
    },
  );

  assert.equal(outcome.action, "proceed");
  assert.equal(outcome.reply, "Cambiaré a un parser basado en gramática.");
  assert.equal(outcome.questions, undefined);
});

test("instructions: ask cuando el agente necesita aclarar", async () => {
  const outcome = await askTaskAgent(makeTask(), [], "arréglalo", {
    execute: async () =>
      "```json\n" +
      JSON.stringify({
        action: "ask",
        message: "Necesito una aclaración.",
        questions: ["¿Qué gramática prefieres?", "¿Mantengo el parser actual?"],
      }) +
      "\n```",
    maxAttempts: 1,
  });

  assert.equal(outcome.action, "ask");
  assert.equal(outcome.questions?.length, 2);
});

test("instructions: respuesta inválida dispara reparación", async () => {
  let calls = 0;
  const outcome = await askTaskAgent(makeTask(), [], "cambia el enfoque", {
    execute: async () => {
      calls += 1;
      return calls === 1
        ? "no soy json"
        : JSON.stringify({ action: "proceed", message: "listo" });
    },
    maxAttempts: 2,
  });

  assert.equal(calls, 2);
  assert.equal(outcome.action, "proceed");
});

test("instructions: el prompt incluye la tarea, el historial y la instrucción", async () => {
  let prompt = "";
  await askTaskAgent(
    makeTask(),
    [
      { role: "user", content: "primera instrucción" },
      { role: "assistant", content: "primera respuesta" },
    ],
    "segunda instrucción",
    {
      execute: async (value) => {
        prompt = value;
        return JSON.stringify({ action: "proceed", message: "ok" });
      },
      maxAttempts: 1,
    },
  );

  assert.match(prompt, /TASK-001/);
  assert.match(prompt, /Implementar parser/);
  assert.match(prompt, /primera instrucción/);
  assert.match(prompt, /primera respuesta/);
  assert.match(prompt, /segunda instrucción/);
  assert.match(prompt, /review no aprobado/);
});
