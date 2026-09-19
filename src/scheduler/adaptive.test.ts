import assert from "node:assert/strict";
import { test } from "node:test";
import type { Task } from "../tasks/types.js";
import { runPlan } from "./scheduler.js";

function task(id: string): Task {
  return {
    id,
    title: id,
    description: id,
    status: "todo",
    type: "coding",
    complexity: "low",
    dependsOn: [],
  };
}

test("concurrencia adaptativa: sube de uno en uno hasta el tope al completar lotes", async () => {
  const changes: number[] = [];

  await runPlan([task("T1"), task("T2"), task("T3"), task("T4")], {
    concurrency: 1,
    maxConcurrency: 4,
    onConcurrencyChange: (value) => changes.push(value),
    executeTask: async (current) => ({ ...current, status: "done" }),
  });

  assert.deepEqual(changes, [2, 3, 4]);
});

test("concurrencia adaptativa: baja a la mitad ante un fallo de disponibilidad", async () => {
  const changes: number[] = [];
  let first = true;

  await runPlan(
    [task("T1"), task("T2"), task("T3"), task("T4"), task("T5"), task("T6")],
    {
      concurrency: 4,
      maxConcurrency: 4,
      onConcurrencyChange: (value) => changes.push(value),
      executeTask: async (current) => {
        if (first) {
          first = false;
          return {
            ...current,
            status: "failed",
            error: "[codex] falló la ejecución (exit code: 1): 429 rate limit",
          };
        }
        return { ...current, status: "done" };
      },
    },
  );

  assert.equal(changes[0], 2);
});

test("concurrencia adaptativa: no cambia sin maxConcurrency", async () => {
  const changes: number[] = [];

  await runPlan([task("T1"), task("T2"), task("T3")], {
    concurrency: 1,
    onConcurrencyChange: (value) => changes.push(value),
    executeTask: async (current) => ({ ...current, status: "done" }),
  });

  assert.deepEqual(changes, []);
});
