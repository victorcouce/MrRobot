import assert from "node:assert/strict";
import { test } from "node:test";
import type { Task } from "../tasks/types.js";
import { reviewTask } from "./reviewer.js";

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

test("reviewer: fuerza el cwd del worktree en el ejecutor", async () => {
  let seenCwd: string | undefined;

  await reviewTask(makeTask(), { checks: [] }, {
    cwd: "/repo/.worktrees/TASK-001-attempt-1",
    execute: async (_prompt, _agent, options) => {
      seenCwd = options?.cwd;
      return JSON.stringify({ approved: true, summary: "ok", issues: [] });
    },
  });

  assert.equal(seenCwd, "/repo/.worktrees/TASK-001-attempt-1");
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
  assert.ok(review.issues.length > 0);
});
