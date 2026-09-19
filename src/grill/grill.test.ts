import assert from "node:assert/strict";
import { test } from "node:test";
import { runGrill } from "./grill.js";

test("grill: la primera ronda devuelve preguntas", async () => {
  const outcome = await runGrill("una calculadora web", [], {
    execute: async () =>
      JSON.stringify({
        done: false,
        questions: [
          {
            id: "Q1",
            title: "Stack",
            body: "¿Qué stack?",
            recommendation: "React + Vite",
          },
        ],
      }),
    maxAttempts: 2,
  });

  assert.equal(outcome.status, "questions");
  if (outcome.status !== "questions") return;
  assert.equal(outcome.questions.length, 1);
  assert.match(outcome.message, /Ronda 1/);
  assert.match(outcome.message, /Recomendado/);
});

test("grill: JSON envuelto en markdown se parsea", async () => {
  const outcome = await runGrill("app", [], {
    execute: async () =>
      "```json\n" +
      JSON.stringify({
        done: true,
        summary: "entendimiento alcanzado",
      }) +
      "\n```",
    maxAttempts: 1,
  });

  assert.equal(outcome.status, "done");
  if (outcome.status !== "done") return;
  assert.equal(outcome.summary, "entendimiento alcanzado");
});

test("grill: respuesta inválida dispara reparación", async () => {
  let calls = 0;
  const outcome = await runGrill("app", [], {
    execute: async () => {
      calls += 1;
      return calls === 1
        ? "no soy json"
        : JSON.stringify({
            done: true,
            summary: "listo",
          });
    },
    maxAttempts: 2,
  });

  assert.equal(calls, 2);
  assert.equal(outcome.status, "done");
});

test("grill: el prompt plantea un proyecto nuevo, ajeno al repositorio actual", async () => {
  let prompt = "";
  const outcome = await runGrill(
    "una calculadora web",
    [],
    {
      execute: async (value) => {
        prompt = value;
        return JSON.stringify({ done: true, summary: "listo" });
      },
      maxAttempts: 1,
    },
    "/tmp/calc",
  );

  assert.equal(outcome.status, "done");
  assert.match(prompt, /proyecto NUEVO/);
  assert.match(prompt, /\/tmp\/calc/);
  assert.match(prompt, /No lo inspecciones/);
  assert.match(prompt, /src\/ o ui\//);
  assert.doesNotMatch(prompt, /MrRobot|Mr Robot/i);
});

test("grill: el número de ronda crece con el historial", async () => {
  const outcome = await runGrill(
    "app",
    [
      { role: "assistant", content: "Ronda 1\nQ1 — stack" },
      { role: "user", content: "Q1: react" },
    ],
    {
      execute: async () =>
        JSON.stringify({
          done: false,
          questions: [
            { id: "Q2", title: "Deploy", body: "¿Dónde?", recommendation: "Vercel" },
          ],
        }),
      maxAttempts: 1,
    },
  );

  assert.equal(outcome.status, "questions");
  if (outcome.status !== "questions") return;
  assert.match(outcome.message, /Ronda 2/);
});
