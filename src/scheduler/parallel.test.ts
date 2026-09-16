import assert from "node:assert/strict";
import { test } from "node:test";
import { runTask } from "../tasks/runner.js";
import type { Task, TaskStatus } from "../tasks/types.js";
import type { WorkspaceManager } from "../workspace/types.js";
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

function statusById(tasks: Task[]): Map<string, TaskStatus> {
  return new Map(tasks.map((task) => [task.id, task.status]));
}

interface TrackingExecutor {
  executeTask: (task: Task) => Promise<Task>;
  executed: string[];
  maxActive: () => number;
}

function trackingExecutor(
  options: { failing?: string[]; delayMs?: number } = {},
): TrackingExecutor {
  const failing = new Set(options.failing ?? []);
  const delay = options.delayMs ?? 0;
  const executed: string[] = [];
  let active = 0;
  let maxActive = 0;

  const executeTask = async (task: Task): Promise<Task> => {
    executed.push(task.id);
    active += 1;
    maxActive = Math.max(maxActive, active);

    await new Promise((resolve) => setTimeout(resolve, delay));

    active -= 1;

    if (failing.has(task.id)) {
      return {
        ...task,
        status: "failed",
        error: "boom",
        finishedAt: new Date(),
      };
    }

    return { ...task, status: "done", output: "ok", finishedAt: new Date() };
  };

  return { executeTask, executed, maxActive: () => maxActive };
}

function fakeWorkspaceManager(): WorkspaceManager {
  let commits = 0;

  return {
    getRepoRoot: async () => "/fake/repo",
    resolveBaseRef: async () => "fakesha",
    isDirty: async () => false,
    create: async (taskId, attempt, baseRef) => ({
      taskId,
      branchName: `agent/${taskId}-attempt-${attempt}`,
      path: `/fake/repo/.worktrees/${taskId}-attempt-${attempt}`,
      baseRef,
    }),
    commit: async () => {
      commits += 1;
      return `fakecommit-${commits}`;
    },
    remove: async () => {},
  };
}

test("Paralelo Caso 1: dos tareas independientes se solapan", async (t) => {
  t.mock.method(console, "log", () => {});

  const exec = trackingExecutor({ delayMs: 40 });
  const result = await runPlan(
    [makeTask("TASK-001"), makeTask("TASK-002")],
    { executeTask: exec.executeTask, concurrency: 2 },
  );

  assert.equal(result.status, "completed");
  assert.equal(exec.maxActive(), 2);
});

test("Paralelo Caso 2: concurrency 1 es secuencial", async (t) => {
  t.mock.method(console, "log", () => {});

  const exec = trackingExecutor({ delayMs: 10 });
  const result = await runPlan(
    [makeTask("TASK-001"), makeTask("TASK-002"), makeTask("TASK-003")],
    { executeTask: exec.executeTask, concurrency: 1 },
  );

  assert.equal(result.status, "completed");
  assert.equal(exec.maxActive(), 1);
  assert.deepEqual(exec.executed, ["TASK-001", "TASK-002", "TASK-003"]);
});

test("Paralelo Caso 3: tres tareas con concurrency 2 usan dos tandas", async (t) => {
  t.mock.method(console, "log", () => {});

  const exec = trackingExecutor({ delayMs: 20 });
  const result = await runPlan(
    [makeTask("TASK-001"), makeTask("TASK-002"), makeTask("TASK-003")],
    { executeTask: exec.executeTask, concurrency: 2 },
  );

  assert.equal(result.status, "completed");
  assert.equal(exec.maxActive(), 2);
  assert.deepEqual(exec.executed, ["TASK-001", "TASK-002", "TASK-003"]);
});

test("Paralelo Caso 4: DAG ejecuta 002 y 003 juntas y 004 después", async (t) => {
  t.mock.method(console, "log", () => {});

  const exec = trackingExecutor({ delayMs: 20 });
  const result = await runPlan(
    [
      makeTask("TASK-001"),
      makeTask("TASK-002", ["TASK-001"]),
      makeTask("TASK-003", ["TASK-001"]),
      makeTask("TASK-004", ["TASK-002", "TASK-003"]),
    ],
    { executeTask: exec.executeTask, concurrency: 2 },
  );

  assert.equal(result.status, "completed");
  assert.equal(exec.maxActive(), 2);
  assert.deepEqual(exec.executed, [
    "TASK-001",
    "TASK-002",
    "TASK-003",
    "TASK-004",
  ]);
});

test("Paralelo Caso 5: el fallo de una rama no detiene las independientes", async (t) => {
  t.mock.method(console, "log", () => {});

  const exec = trackingExecutor({ failing: ["TASK-002"], delayMs: 10 });
  const result = await runPlan(
    [
      makeTask("TASK-001"),
      makeTask("TASK-002", ["TASK-001"]),
      makeTask("TASK-003", ["TASK-001"]),
      makeTask("TASK-004", ["TASK-002"]),
      makeTask("TASK-005", ["TASK-003"]),
    ],
    { executeTask: exec.executeTask, concurrency: 2 },
  );

  const statuses = statusById(result.tasks);

  assert.equal(result.status, "failed");
  assert.equal(statuses.get("TASK-002"), "failed");
  assert.equal(statuses.get("TASK-003"), "done");
  assert.equal(statuses.get("TASK-004"), "blocked");
  assert.equal(statuses.get("TASK-005"), "done");
  assert.ok(exec.executed.includes("TASK-005"));
});

test("Paralelo Caso 6: ninguna tarea se ejecuta dos veces", async (t) => {
  t.mock.method(console, "log", () => {});

  const exec = trackingExecutor({ delayMs: 5 });
  await runPlan(
    [
      makeTask("TASK-001"),
      makeTask("TASK-002", ["TASK-001"]),
      makeTask("TASK-003", ["TASK-001"]),
      makeTask("TASK-004", ["TASK-002", "TASK-003"]),
    ],
    { executeTask: exec.executeTask, concurrency: 2 },
  );

  assert.equal(new Set(exec.executed).size, exec.executed.length);
  assert.deepEqual([...exec.executed].sort(), [
    "TASK-001",
    "TASK-002",
    "TASK-003",
    "TASK-004",
  ]);
});

test("Paralelo Caso 7: cada tarea paralela recibe un cwd distinto", async (t) => {
  t.mock.method(console, "log", () => {});

  const manager = fakeWorkspaceManager();
  const cwds: string[] = [];

  const executeTask = (task: Task) =>
    runTask(task, {
      workspace: manager,
      execute: async (_prompt, _agent, options) => {
        if (options?.cwd) {
          cwds.push(options.cwd);
        }
        return "ok";
      },
    });

  const result = await runPlan(
    [makeTask("TASK-001"), makeTask("TASK-002")],
    { executeTask, concurrency: 2 },
  );

  assert.equal(result.status, "completed");
  assert.equal(cwds.length, 2);
  assert.equal(new Set(cwds).size, 2);
  assert.ok(cwds.every((cwd) => cwd.includes(".worktrees")));
});

test("Paralelo Caso 8: concurrency inválida falla claramente", async (t) => {
  t.mock.method(console, "log", () => {});

  const exec = trackingExecutor();

  for (const concurrency of [0, -1, Number.NaN, 1.5]) {
    await assert.rejects(
      () =>
        runPlan([makeTask("TASK-001")], {
          executeTask: exec.executeTask,
          concurrency,
        }),
      /concurrency/,
    );
  }

  assert.deepEqual(exec.executed, []);
});

test("Paralelo: nunca se supera el límite de concurrencia", async (t) => {
  t.mock.method(console, "log", () => {});

  const exec = trackingExecutor({ delayMs: 20 });
  await runPlan(
    ["TASK-001", "TASK-002", "TASK-003", "TASK-004", "TASK-005"].map((id) =>
      makeTask(id),
    ),
    { executeTask: exec.executeTask, concurrency: 3 },
  );

  assert.equal(exec.maxActive(), 3);
});

test("Paralelo: dos tareas de 150ms con concurrency 2 tardan menos que secuencial", async (t) => {
  t.mock.method(console, "log", () => {});

  const delay = 150;

  const parallel = trackingExecutor({ delayMs: delay });
  const startParallel = Date.now();
  const result = await runPlan(
    [makeTask("TASK-001"), makeTask("TASK-002")],
    { executeTask: parallel.executeTask, concurrency: 2 },
  );
  const parallelElapsed = Date.now() - startParallel;

  const sequential = trackingExecutor({ delayMs: delay });
  const startSequential = Date.now();
  await runPlan(
    [makeTask("TASK-001"), makeTask("TASK-002")],
    { executeTask: sequential.executeTask, concurrency: 1 },
  );
  const sequentialElapsed = Date.now() - startSequential;

  assert.equal(result.status, "completed");
  assert.equal(parallel.maxActive(), 2);
  assert.equal(sequential.maxActive(), 1);
  assert.ok(
    parallelElapsed < sequentialElapsed * 0.8,
    `paralelo ${parallelElapsed}ms debería ser menor que secuencial ${sequentialElapsed}ms`,
  );
});

test("Paralelo: registra startedAt y finishedAt por tarea", async (t) => {
  t.mock.method(console, "log", () => {});

  const exec = trackingExecutor({ delayMs: 10 });
  const result = await runPlan(
    [makeTask("TASK-001"), makeTask("TASK-002")],
    { executeTask: exec.executeTask, concurrency: 2 },
  );

  for (const task of result.tasks) {
    const startedAt = task.startedAt;
    const finishedAt = task.finishedAt;

    assert.ok(startedAt instanceof Date);
    assert.ok(finishedAt instanceof Date);
    assert.ok(finishedAt.getTime() >= startedAt.getTime());
  }
});
