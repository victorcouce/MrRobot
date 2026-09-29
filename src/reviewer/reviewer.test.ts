import assert from "node:assert/strict";
import { test } from "node:test";
import type { Task } from "../tasks/types.js";
import { MAX_REVIEW_DIFF_CHARS, reviewTask } from "./reviewer.js";

function makeTask(): Task {
  return {
    id: "TASK-001",
    title: "implementar",
    description: "implementar algo",
    status: "done",
    type: "coding",
    complexity: "low",
    acceptanceCriteria: ["compila"],
  };
}

test("reviewer: PASS", async () => {
  const review = await reviewTask(makeTask(), {}, {
    execute: async () =>
      JSON.stringify({ approved: true, summary: "todo bien", issues: [] }),
  });

  assert.equal(review.approved, true);
  assert.equal(review.issues.length, 0);
});

test("reviewer: FAIL con issues", async () => {
  const review = await reviewTask(makeTask(), {}, {
    execute: async () =>
      JSON.stringify({
        approved: false,
        summary: "faltan cosas",
        issues: [{ severity: "high", description: "no compila" }],
        suggestedFixes: ["arreglar imports"],
      }),
  });

  assert.equal(review.approved, false);
  assert.equal(review.issues[0]?.severity, "high");
  assert.deepEqual(review.suggestedFixes, ["arreglar imports"]);
});

test("reviewer: corre sin herramientas en el cwd del worktree", async () => {
  let seenCwd: string | undefined;
  let seenTools: string | undefined;

  await reviewTask(makeTask(), { checks: [] }, {
    cwd: "/repo/.worktrees/TASK-001-attempt-1",
    execute: async (_prompt, _agent, options) => {
      seenCwd = options?.cwd;
      seenTools = options?.tools;
      return JSON.stringify({ approved: true, summary: "ok", issues: [] });
    },
  });

  assert.equal(seenCwd, "/repo/.worktrees/TASK-001-attempt-1");
  assert.equal(seenTools, "none");
});

test("reviewer: reancla criterios absolutos del repo en el prompt", async () => {
  let prompt = "";

  await reviewTask(
    { ...makeTask(), acceptanceCriteria: ["existe /repo/package.json"] },
    { repoRoot: "/repo" },
    {
      execute: async (value) => {
        prompt = value;
        return JSON.stringify({ approved: true, summary: "ok", issues: [] });
      },
    },
  );

  assert.match(prompt, /existe package\.json/);
  assert.doesNotMatch(prompt, /\/repo\/package\.json/);
});

test("reviewer: respuesta inválida se trata como no aprobada", async () => {
  const review = await reviewTask(makeTask(), {}, {
    execute: async () => "no soy json",
  });

  assert.equal(review.approved, false);
  assert.equal(review.unavailable, true);
  assert.ok(review.issues.length > 0);
});

test("reviewer: si la respuesta no es JSON, solo pide reformatearla", async () => {
  const prompts: string[] = [];
  const review = await reviewTask(makeTask(), { diff: "DIFF-GRANDE" }, {
    execute: async (prompt) => {
      prompts.push(prompt);
      return prompts.length === 1
        ? "Todo correcto, apruebo la tarea."
        : JSON.stringify({ approved: true, summary: "ok", issues: [] });
    },
  });

  assert.equal(prompts.length, 2);
  // El segundo prompt lleva la valoración anterior, no el diff otra vez.
  assert.match(prompts[1] ?? "", /Todo correcto, apruebo la tarea\./);
  assert.doesNotMatch(prompts[1] ?? "", /DIFF-GRANDE/);
  assert.equal(review.approved, true);
  assert.equal(review.unavailable, undefined);
});

test("reviewer: solo manda la salida de los checks que fallan y acota el diff", async () => {
  let prompt = "";

  await reviewTask(
    makeTask(),
    {
      checks: [
        { command: "npm run build", success: true, stdout: "RUIDO-DE-BUILD" },
        { command: "npm test", success: false, stderr: "AssertionError x" },
      ],
      diff: "d".repeat(MAX_REVIEW_DIFF_CHARS + 500),
    },
    {
      execute: async (value) => {
        prompt = value;
        return JSON.stringify({ approved: false, summary: "ko", issues: [] });
      },
    },
  );

  assert.match(prompt, /npm run build: OK/);
  assert.doesNotMatch(prompt, /RUIDO-DE-BUILD/);
  assert.match(prompt, /AssertionError x/);
  assert.match(prompt, /500 caracteres omitidos/);
  assert.ok(!prompt.includes("d".repeat(MAX_REVIEW_DIFF_CHARS + 1)));
});
