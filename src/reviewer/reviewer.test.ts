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

test("reviewer: respuesta inválida se trata como no aprobada", async () => {
  const review = await reviewTask(makeTask(), {}, {
    execute: async () => "no soy json",
  });

  assert.equal(review.approved, false);
  assert.ok(review.issues.length > 0);
});
