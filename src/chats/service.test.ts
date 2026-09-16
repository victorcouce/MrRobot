import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProjectDeps } from "../projects/service.js";
import { createProjectDraft } from "../projects/service.js";
import { InMemoryStorage } from "../storage/memory.js";
import {
  createChat,
  deleteChat,
  getChatDetail,
  listChats,
  sendChatMessage,
} from "./service.js";

const PLAN = JSON.stringify({
  summary: "Plan del chat",
  tasks: [
    {
      id: "TASK-001",
      title: "Implementar A",
      description: "hacer A",
      type: "coding",
      complexity: "low",
      dependsOn: [],
      acceptanceCriteria: ["A funciona"],
    },
    {
      id: "TASK-002",
      title: "Probar B",
      description: "probar B",
      type: "testing",
      complexity: "low",
      dependsOn: ["TASK-001"],
      acceptanceCriteria: [],
    },
  ],
});

function makeDeps(storage: InMemoryStorage, onPrompt?: (prompt: string) => void): ProjectDeps {
  return {
    storage,
    plannerExecute: async (prompt) => {
      onPrompt?.(prompt);
      return PLAN;
    },
  };
}

test("chat: enviar mensaje genera tareas asociadas con ids únicos", async () => {
  const storage = new InMemoryStorage();
  await storage.init();

  const deps = makeDeps(storage);
  const draft = await createProjectDraft({ goal: "objetivo" }, deps);
  const chat = await createChat(draft.id, { message: "añade una feature" }, deps);

  assert.equal(chat.title, "añade una feature");

  await sendChatMessage(draft.id, chat.id, "añade una feature", deps);

  const project = await storage.getProject(draft.id);
  assert.ok(project);
  assert.equal(project.status, "ready");

  const chatTasks = project.tasks.filter((task) => task.chatId === chat.id);
  assert.equal(chatTasks.length, 2);
  assert.deepEqual(
    chatTasks.map((task) => task.id),
    ["C1-TASK-001", "C1-TASK-002"],
  );
  assert.deepEqual(chatTasks[1]?.dependsOn, ["C1-TASK-001"]);

  const detail = await getChatDetail(draft.id, chat.id, deps);
  assert.equal(detail.messages.length, 2);
  assert.equal(detail.messages[0]?.role, "user");
  assert.equal(detail.messages[1]?.role, "assistant");
  assert.deepEqual(detail.messages[1]?.taskIds, [
    "C1-TASK-001",
    "C1-TASK-002",
  ]);
  assert.equal(detail.taskIds.length, 2);
});

test("chat: iterar conserva las tareas done y no duplica ids", async () => {
  const storage = new InMemoryStorage();
  await storage.init();

  const deps = makeDeps(storage);
  const draft = await createProjectDraft({ goal: "objetivo" }, deps);
  const chat = await createChat(draft.id, { title: "iterar" }, deps);

  await sendChatMessage(draft.id, chat.id, "primer paso", deps);

  const project = await storage.getProject(draft.id);
  assert.ok(project);

  const tasks = project.tasks.map((task) =>
    task.id === "C1-TASK-001"
      ? { ...task, status: "done" as const, resultCommit: "abc123" }
      : task,
  );
  await storage.saveProject({ ...project, tasks });

  await sendChatMessage(draft.id, chat.id, "segundo paso", deps);

  const updated = await storage.getProject(draft.id);
  assert.ok(updated);

  const done = updated.tasks.find((task) => task.id === "C1-TASK-001");
  assert.equal(done?.status, "done");
  assert.equal(done?.resultCommit, "abc123");

  const ids = updated.tasks.map((task) => task.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("chat: varios chats tienen tareas independientes", async () => {
  const storage = new InMemoryStorage();
  await storage.init();

  const deps = makeDeps(storage);
  const draft = await createProjectDraft({ goal: "objetivo" }, deps);

  const chat1 = await createChat(draft.id, { title: "uno" }, deps);
  const chat2 = await createChat(draft.id, { title: "dos" }, deps);

  await sendChatMessage(draft.id, chat1.id, "mensaje uno", deps);
  await sendChatMessage(draft.id, chat2.id, "mensaje dos", deps);

  const project = await storage.getProject(draft.id);
  assert.ok(project);

  assert.ok(project.tasks.some((task) => task.id === "C1-TASK-001"));
  assert.ok(project.tasks.some((task) => task.id === "C2-TASK-001"));

  const chats = await listChats(draft.id, deps);
  assert.equal(chats.length, 2);
  assert.equal(chats[0]?.taskIds.length, 2);
  assert.equal(chats[1]?.taskIds.length, 2);
});

test("chat: iterar sobre un proyecto completed lo reactiva a ready", async () => {
  const storage = new InMemoryStorage();
  await storage.init();

  const deps = makeDeps(storage);
  const draft = await createProjectDraft({ goal: "objetivo" }, deps);
  const chat = await createChat(draft.id, { title: "extra" }, deps);

  await sendChatMessage(draft.id, chat.id, "primer paso", deps);

  const project = await storage.getProject(draft.id);
  assert.ok(project);

  await storage.saveProject({
    ...project,
    status: "completed",
    resultBranch: "agent/project-x-final",
    resultCommit: "final-1",
    finishedAt: new Date(),
  });

  await sendChatMessage(draft.id, chat.id, "una mejora más", deps);

  const updated = await storage.getProject(draft.id);
  assert.equal(updated?.status, "ready");
  assert.equal(updated?.resultBranch, undefined);
  assert.equal(updated?.resultCommit, undefined);
});

test("chat: borrar el chat elimina sus tareas", async () => {
  const storage = new InMemoryStorage();
  await storage.init();

  const deps = makeDeps(storage);
  const draft = await createProjectDraft({ goal: "objetivo" }, deps);
  const chat = await createChat(draft.id, { title: "borrar" }, deps);

  await sendChatMessage(draft.id, chat.id, "mensaje", deps);
  await deleteChat(draft.id, chat.id, deps);

  const project = await storage.getProject(draft.id);
  assert.equal(project?.tasks.length, 0);
  assert.equal((await listChats(draft.id, deps)).length, 0);
});

test("chat: incluye la conversación previa en el prompt del planner", async () => {
  const storage = new InMemoryStorage();
  await storage.init();

  const prompts: string[] = [];
  const deps = makeDeps(storage, (prompt) => prompts.push(prompt));
  const draft = await createProjectDraft({ goal: "objetivo" }, deps);
  const chat = await createChat(draft.id, { title: "contexto" }, deps);

  await sendChatMessage(draft.id, chat.id, "primer mensaje", deps);
  await sendChatMessage(draft.id, chat.id, "segundo mensaje", deps);

  assert.ok(prompts[0]?.includes("primer mensaje"));
  assert.ok(prompts[1]?.includes("primer mensaje"));
  assert.ok(prompts[1]?.includes("segundo mensaje"));
});
