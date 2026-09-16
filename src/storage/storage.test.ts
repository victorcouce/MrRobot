import assert from "node:assert/strict";
import { test } from "node:test";
import type { Project } from "../projects/types.js";
import type { Task } from "../tasks/types.js";
import { InMemoryStorage } from "./memory.js";
import { createPgliteStorage } from "./pglite.js";
import type { Storage } from "./types.js";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "TASK-001",
    title: "Diseñar modelo",
    description: "diseñar el modelo de datos",
    status: "done",
    type: "coding",
    complexity: "medium",
    ...overrides,
  };
}

function makeProject(): Project {
  return {
    id: "proj-1",
    name: "habits",
    goal: "crear app de hábitos",
    status: "running",
    baseRef: "base0",
    tasks: [
      makeTask({
        dependsOn: [],
        acceptanceCriteria: ["compila"],
        executedBy: { provider: "claude", model: "sonnet" },
        resultCommit: "abc123",
        attempts: [
          {
            agent: { provider: "claude", model: "sonnet" },
            attempt: 1,
            startedAt: new Date("2026-01-01T00:00:00Z"),
            finishedAt: new Date("2026-01-01T00:01:00Z"),
            status: "success",
            workspacePath: "/tmp/ws",
            branchName: "agent/TASK-001-attempt-1",
            baseRef: "base0",
            commitSha: "abc123",
          },
        ],
      }),
      makeTask({
        id: "TASK-002",
        title: "UI",
        dependsOn: ["TASK-001"],
        status: "blocked",
      }),
    ],
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:02:00Z"),
    startedAt: new Date("2026-01-01T00:00:00Z"),
  };
}

async function roundTrip(storage: Storage): Promise<void> {
  await storage.init();
  const project = makeProject();
  await storage.saveProject(project);

  const loaded = await storage.getProject("proj-1");
  assert.ok(loaded);
  assert.equal(loaded.name, "habits");
  assert.equal(loaded.status, "running");
  assert.equal(loaded.tasks.length, 2);

  const task1 = loaded.tasks.find((task) => task.id === "TASK-001");
  assert.ok(task1);
  assert.equal(task1.status, "done");
  assert.deepEqual(task1.acceptanceCriteria, ["compila"]);
  assert.deepEqual(task1.executedBy, { provider: "claude", model: "sonnet" });
  assert.equal(task1.resultCommit, "abc123");
  assert.equal(task1.attempts?.length, 1);
  assert.equal(task1.attempts?.[0]?.branchName, "agent/TASK-001-attempt-1");

  const task2 = loaded.tasks.find((task) => task.id === "TASK-002");
  assert.deepEqual(task2?.dependsOn, ["TASK-001"]);
  assert.equal(task2?.status, "blocked");

  await storage.appendEvent({
    id: "ev-1",
    projectId: "proj-1",
    type: "task.completed",
    taskId: "TASK-001",
    payload: { commit: "abc123" },
    createdAt: new Date("2026-01-01T00:01:00Z"),
  });
  const events = await storage.listEvents("proj-1");
  assert.equal(events.length, 1);
  assert.equal(events[0]?.type, "task.completed");
  assert.deepEqual(events[0]?.payload, { commit: "abc123" });

  await storage.saveReview({
    id: "rev-1",
    projectId: "proj-1",
    taskId: "TASK-001",
    attempt: 1,
    approved: true,
    summary: "ok",
    issues: [],
    createdAt: new Date(),
  });
  await storage.saveSupervisorRun({
    id: "sup-1",
    projectId: "proj-1",
    action: "continue",
    reason: "todo bien",
    createdAt: new Date(),
  });
  await storage.saveAgentRun({
    id: "run-1",
    projectId: "proj-1",
    role: "planner",
    provider: "claude",
    model: "opus",
    status: "success",
    startedAt: new Date(),
    finishedAt: new Date(),
  });

  const projects = await storage.listProjects();
  assert.equal(projects.length, 1);

  await storage.close();
}

test("InMemoryStorage round-trip", async () => {
  await roundTrip(new InMemoryStorage());
});

test("PGlite SqlStorage round-trip", async () => {
  const { storage, close } = await createPgliteStorage();

  try {
    await roundTrip(storage);
  } finally {
    await close();
  }
});
