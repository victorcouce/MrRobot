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
    config: {
      concurrency: 4,
      maxRetriesPerAgent: 2,
      maxReviewFixCycles: 3,
      plannerMaxAttempts: 2,
      plannerAgent: { provider: "claude", model: "opus" },
      reviewerAgent: { provider: "claude", model: "opus" },
      supervisorAgent: { provider: "codex" },
      checks: { commands: ["test"] },
    },
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
        chatId: "chat-1",
        status: "blocked",
        attachmentIds: ["att-1"],
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
  assert.equal(loaded.config?.concurrency, 4);
  assert.deepEqual(loaded.config?.plannerAgent, { provider: "claude", model: "opus" });
  assert.deepEqual(loaded.config?.supervisorAgent, { provider: "codex" });

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
  assert.equal(task2?.chatId, "chat-1");
  assert.deepEqual(task2?.attachmentIds, ["att-1"]);

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

  await storage.saveChat({
    id: "chat-1",
    projectId: "proj-1",
    title: "Iterar la UI",
    seq: 1,
    allowedAgents: [
      { provider: "codex" },
      { provider: "claude", model: "sonnet" },
    ],
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:03:00Z"),
  });
  await storage.appendChatMessage({
    id: "msg-1",
    chatId: "chat-1",
    projectId: "proj-1",
    role: "user",
    content: "añade tests de UI",
    taskIds: [],
    attachments: [
      {
        id: "att-1",
        name: "mockup.png",
        type: "image",
        mimeType: "image/png",
        size: 1234,
        data: "aGVsbG8=",
        createdAt: new Date("2026-01-01T00:01:00Z"),
      },
    ],
    createdAt: new Date("2026-01-01T00:02:00Z"),
  });
  await storage.appendChatMessage({
    id: "msg-2",
    chatId: "chat-1",
    projectId: "proj-1",
    role: "assistant",
    content: "he añadido TASK-002",
    taskIds: ["TASK-002"],
    agent: { provider: "claude", model: "opus" },
    createdAt: new Date("2026-01-01T00:03:00Z"),
  });

  const chats = await storage.listChats("proj-1");
  assert.equal(chats.length, 1);
  assert.equal(chats[0]?.title, "Iterar la UI");
  assert.equal(chats[0]?.seq, 1);

  const loadedChat = await storage.getChat("chat-1");
  assert.equal(loadedChat?.projectId, "proj-1");
  assert.deepEqual(loadedChat?.allowedAgents, [
    { provider: "codex" },
    { provider: "claude", model: "sonnet" },
  ]);

  const messages = await storage.listChatMessages("chat-1");
  assert.equal(messages.length, 2);
  assert.equal(messages[0]?.role, "user");
  assert.deepEqual(messages[0]?.attachments, [
    {
      id: "att-1",
      name: "mockup.png",
      type: "image",
      mimeType: "image/png",
      size: 1234,
      data: "aGVsbG8=",
      createdAt: new Date("2026-01-01T00:01:00Z"),
    },
  ]);
  assert.deepEqual(messages[1]?.taskIds, ["TASK-002"]);
  assert.deepEqual(messages[1]?.agent, { provider: "claude", model: "opus" });

  const projects = await storage.listProjects();
  assert.equal(projects.length, 1);

  await storage.deleteProject("proj-1");
  assert.equal(await storage.getProject("proj-1"), undefined);
  assert.equal((await storage.listProjects()).length, 0);
  assert.equal((await storage.listEvents("proj-1")).length, 0);
  assert.equal((await storage.listReviews("proj-1")).length, 0);
  assert.equal((await storage.listSupervisorRuns("proj-1")).length, 0);
  assert.equal((await storage.listChats("proj-1")).length, 0);
  assert.equal((await storage.listChatMessages("chat-1")).length, 0);

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
