import assert from "node:assert/strict";
import { test } from "node:test";
import type { Task } from "../tasks/types.js";
import { runPlan } from "./scheduler.js";

function makeTask(id: string, dependsOn: string[] = []): Task {
  return {
    id,
    title: id,
    description: `tarea ${id}`,
    status: "todo",
    type: "coding",
    complexity: "low",
    dependsOn,
  };
}

/** Ejecutor con una duración distinta por tarea, que registra cuándo arranca cada una. */
function timedExecutor(durations: Record<string, number>): {
  executeTask: (task: Task) => Promise<Task>;
  startedAt: Map<string, number>;
  origin: number;
} {
  const startedAt = new Map<string, number>();
  const origin = Date.now();

  return {
    startedAt,
    origin,
    executeTask: async (task: Task): Promise<Task> => {
      startedAt.set(task.id, Date.now() - origin);
      await new Promise((resolve) =>
        setTimeout(resolve, durations[task.id] ?? 0),
      );
      return { ...task, status: "done", output: "ok" };
    },
  };
}

test("pool: una tarea lenta no retiene el hueco de las rápidas", async (t) => {
  t.mock.method(console, "log", () => {});

  // T1 es lenta; T2..T4 son rápidas. Con lotes, T3 y T4 no arrancaban hasta que
  // T1 terminaba. Con el pool, ocupan el hueco de T2 en cuanto se libera.
  const exec = timedExecutor({ T1: 400, T2: 20, T3: 20, T4: 20 });

  const result = await runPlan(
    [makeTask("T1"), makeTask("T2"), makeTask("T3"), makeTask("T4")],
    { executeTask: exec.executeTask, concurrency: 2 },
  );

  assert.equal(result.status, "completed");

  const t3 = exec.startedAt.get("T3");
  const t4 = exec.startedAt.get("T4");

  assert.ok(t3 !== undefined && t4 !== undefined);
  assert.ok(t3 < 300, `T3 arrancó a los ${t3}ms, debería no esperar a T1`);
  assert.ok(t4 < 300, `T4 arrancó a los ${t4}ms, debería no esperar a T1`);
});

test("pool: una dependencia satisfecha se despacha sin esperar a las hermanas", async (t) => {
  t.mock.method(console, "log", () => {});

  // T3 solo depende de T2 (rápida). No debe esperar a T1, que corre en paralelo.
  const exec = timedExecutor({ T1: 400, T2: 20, T3: 20 });

  const result = await runPlan(
    [makeTask("T1"), makeTask("T2"), makeTask("T3", ["T2"])],
    { executeTask: exec.executeTask, concurrency: 2 },
  );

  assert.equal(result.status, "completed");

  const t3 = exec.startedAt.get("T3");

  assert.ok(t3 !== undefined);
  assert.ok(t3 < 300, `T3 arrancó a los ${t3}ms, debería no esperar a T1`);
});

test("pool: nunca se despachan más tareas que la concurrencia", async (t) => {
  t.mock.method(console, "log", () => {});

  let active = 0;
  let peak = 0;

  const result = await runPlan(
    ["T1", "T2", "T3", "T4", "T5", "T6"].map((id) => makeTask(id)),
    {
      concurrency: 2,
      executeTask: async (task) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        return { ...task, status: "done" };
      },
    },
  );

  assert.equal(result.status, "completed");
  assert.equal(peak, 2);
});

test("pool: al pausar se espera a las tareas en vuelo y no se despachan más", async (t) => {
  t.mock.method(console, "log", () => {});

  const executed: string[] = [];
  let paused = false;

  const result = await runPlan(
    ["T1", "T2", "T3", "T4"].map((id) => makeTask(id)),
    {
      concurrency: 2,
      shouldPause: () => paused,
      executeTask: async (task) => {
        executed.push(task.id);
        await new Promise((resolve) => setTimeout(resolve, 20));
        paused = true;
        return { ...task, status: "done" };
      },
    },
  );

  assert.equal(result.status, "paused");
  // Las dos en vuelo terminan; ninguna nueva arranca tras la pausa.
  assert.deepEqual(executed, ["T1", "T2"]);
  assert.equal(
    result.tasks.filter((task) => task.status === "done").length,
    2,
  );
});

test("pool: al cancelar se devuelve cancelled sin dejar tareas en vuelo", async (t) => {
  t.mock.method(console, "log", () => {});

  const controller = new AbortController();
  const executed: string[] = [];

  const result = await runPlan(
    ["T1", "T2", "T3"].map((id) => makeTask(id)),
    {
      concurrency: 1,
      signal: controller.signal,
      executeTask: async (task) => {
        executed.push(task.id);
        controller.abort();
        return { ...task, status: "done" };
      },
    },
  );

  assert.equal(result.status, "cancelled");
  assert.deepEqual(executed, ["T1"]);
});
