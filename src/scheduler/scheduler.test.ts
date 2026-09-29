import assert from "node:assert/strict";
import { test } from "node:test";
import type { Task, TaskStatus } from "../tasks/types.js";
import {
  areDependenciesSatisfied,
  getReadyTasks,
  updateTaskStatuses,
} from "./dependencies.js";
import { runPlan } from "./scheduler.js";

function makeTask(
  id: string,
  dependsOn: string[] = [],
  status: TaskStatus = "todo",
): Task {
  return {
    id,
    title: id,
    description: `tarea ${id}`,
    status,
    type: "coding",
    complexity: "low",
    dependsOn,
  };
}

function mockExecutor(failingIds: string[] = []): {
  executeTask: (task: Task) => Promise<Task>;
  executed: string[];
} {
  const executed: string[] = [];
  const failing = new Set(failingIds);

  return {
    executed,
    executeTask: async (task: Task): Promise<Task> => {
      executed.push(task.id);

      if (failing.has(task.id)) {
        return {
          ...task,
          status: "failed",
          error: "boom",
          finishedAt: new Date(),
        };
      }

      return { ...task, status: "done", output: "ok", finishedAt: new Date() };
    },
  };
}

function statusById(tasks: Task[]): Map<string, TaskStatus> {
  return new Map(tasks.map((task) => [task.id, task.status]));
}

test("Caso 1: plan lineal se ejecuta en orden", async (t) => {
  t.mock.method(console, "log", () => {});

  const { executeTask, executed } = mockExecutor();
  const result = await runPlan(
    [
      makeTask("TASK-001"),
      makeTask("TASK-002", ["TASK-001"]),
      makeTask("TASK-003", ["TASK-002"]),
    ],
    { executeTask },
  );

  assert.equal(result.status, "completed");
  assert.deepEqual(executed, ["TASK-001", "TASK-002", "TASK-003"]);
  assert.ok(result.tasks.every((task) => task.status === "done"));
});

test("Caso 2: DAG respeta el orden del array", async (t) => {
  t.mock.method(console, "log", () => {});

  const { executeTask, executed } = mockExecutor();
  const result = await runPlan(
    [
      makeTask("TASK-001"),
      makeTask("TASK-002", ["TASK-001"]),
      makeTask("TASK-003", ["TASK-001"]),
      makeTask("TASK-004", ["TASK-002", "TASK-003"]),
    ],
    { executeTask },
  );

  assert.equal(result.status, "completed");
  assert.deepEqual(executed, [
    "TASK-001",
    "TASK-002",
    "TASK-003",
    "TASK-004",
  ]);
  assert.ok(result.tasks.every((task) => task.status === "done"));
});

test("Caso 3: dependencia inexistente falla antes de empezar", async (t) => {
  t.mock.method(console, "log", () => {});

  const { executeTask, executed } = mockExecutor();

  await assert.rejects(
    () => runPlan([makeTask("TASK-003", ["TASK-999"])], { executeTask }),
    /TASK-999/,
  );

  assert.deepEqual(executed, []);
});

test("Caso 4: IDs duplicados fallan antes de empezar", async (t) => {
  t.mock.method(console, "log", () => {});

  const { executeTask, executed } = mockExecutor();

  await assert.rejects(
    () =>
      runPlan([makeTask("TASK-001"), makeTask("TASK-001")], { executeTask }),
    /duplicados/,
  );

  assert.deepEqual(executed, []);
});

test("Caso 5: ciclo simple se detecta", async (t) => {
  t.mock.method(console, "log", () => {});

  const { executeTask, executed } = mockExecutor();

  await assert.rejects(
    () =>
      runPlan(
        [
          makeTask("TASK-001", ["TASK-002"]),
          makeTask("TASK-002", ["TASK-001"]),
        ],
        { executeTask },
      ),
    /circular/,
  );

  assert.deepEqual(executed, []);
});

test("Caso 6: ciclo de tres tareas se detecta", async (t) => {
  t.mock.method(console, "log", () => {});

  const { executeTask, executed } = mockExecutor();

  await assert.rejects(
    () =>
      runPlan(
        [
          makeTask("TASK-001", ["TASK-003"]),
          makeTask("TASK-002", ["TASK-001"]),
          makeTask("TASK-003", ["TASK-002"]),
        ],
        { executeTask },
      ),
    /circular/,
  );

  assert.deepEqual(executed, []);
});

test("Caso 7: una tarea failed bloquea a sus dependientes", async (t) => {
  t.mock.method(console, "log", () => {});

  const { executeTask, executed } = mockExecutor(["TASK-002"]);
  const result = await runPlan(
    [
      makeTask("TASK-001"),
      makeTask("TASK-002"),
      makeTask("TASK-003", ["TASK-002"]),
    ],
    { executeTask },
  );

  assert.equal(result.status, "failed");
  assert.deepEqual(executed, ["TASK-001", "TASK-002"]);

  const statuses = statusById(result.tasks);
  assert.equal(statuses.get("TASK-001"), "done");
  assert.equal(statuses.get("TASK-002"), "failed");
  assert.equal(statuses.get("TASK-003"), "blocked");

  assert.deepEqual(result.failedTaskIds, ["TASK-002"]);
  assert.deepEqual(result.blockedTaskIds, ["TASK-003"]);
});

test("Caso 8: tareas independientes se completan (concurrencia por defecto)", async (t) => {
  t.mock.method(console, "log", () => {});

  const { executeTask, executed } = mockExecutor();
  const result = await runPlan(
    [makeTask("TASK-001"), makeTask("TASK-002")],
    { executeTask },
  );

  assert.equal(result.status, "completed");
  assert.deepEqual(executed, ["TASK-001", "TASK-002"]);
});

test("areDependenciesSatisfied exige estado done", () => {
  const doneA = makeTask("A", [], "done");
  const runningB = makeTask("B", [], "running");
  const doneB = makeTask("B", [], "done");
  const dependent = makeTask("C", ["A", "B"]);

  assert.equal(
    areDependenciesSatisfied(dependent, [doneA, runningB, dependent]),
    false,
  );
  assert.equal(
    areDependenciesSatisfied(dependent, [doneA, doneB, dependent]),
    true,
  );
  assert.equal(areDependenciesSatisfied(makeTask("D"), []), true);
});

test("updateTaskStatuses preserva estados terminales", () => {
  const updated = updateTaskStatuses([
    makeTask("A", [], "done"),
    makeTask("B", [], "failed"),
    makeTask("C", [], "running"),
  ]);

  assert.deepEqual(
    updated.map((task) => task.status),
    ["done", "failed", "running"],
  );
});

test("updateTaskStatuses marca blocked con motivo ante dependencia failed", () => {
  const failed = makeTask("A", [], "failed");
  const dependent = makeTask("B", ["A"]);

  const updated = updateTaskStatuses([failed, dependent]);

  assert.equal(updated[1]?.status, "blocked");
  assert.match(updated[1]?.blockedReason ?? "", /A/);
});

test("getReadyTasks conserva el orden del array", () => {
  const ready = getReadyTasks([
    makeTask("A", [], "ready"),
    makeTask("B", [], "blocked"),
    makeTask("C", [], "ready"),
  ]);

  assert.deepEqual(
    ready.map((task) => task.id),
    ["A", "C"],
  );
});
