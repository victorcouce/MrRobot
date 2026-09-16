import { randomUUID } from "node:crypto";
import { defaultConfig } from "../config/index.js";
import { planProject } from "../planner/planner.js";
import type {
  GeneratedPlan,
  PlanContext,
} from "../planner/types.js";
import { emitProjectEvent, type ProjectDeps } from "../projects/service.js";
import type { Project } from "../projects/types.js";
import { validatePlan } from "../scheduler/validation.js";
import type { Task } from "../tasks/types.js";
import type { Chat, ChatMessage } from "./types.js";

const REACTIVATABLE_STATUSES = new Set([
  "draft",
  "completed",
  "failed",
  "cancelled",
]);

export interface CreateChatInput {
  title?: string;
  message?: string;
}

export interface ChatSummaryResult {
  chat: Chat;
  messageCount: number;
  taskIds: string[];
}

export interface ChatDetailResult {
  chat: Chat;
  messages: ChatMessage[];
  taskIds: string[];
}

function deriveChatTitle(content: string): string {
  const firstLine = content.trim().split("\n")[0] ?? "Nuevo chat";
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine;
}

function chatPrefix(seq: number): string {
  return `C${seq}`;
}

export function remapChatTasks(
  plan: GeneratedPlan,
  seq: number,
  chatId: string,
): Task[] {
  const prefix = chatPrefix(seq);
  const ids = new Map<string, string>();

  for (const task of plan.tasks) {
    ids.set(task.id, `${prefix}-${task.id}`);
  }

  return plan.tasks.map((task) => ({
    id: ids.get(task.id) as string,
    title: task.title,
    description: task.description,
    status: "todo" as const,
    type: task.type,
    complexity: task.complexity,
    chatId,
    dependsOn: (task.dependsOn ?? []).map((id) => ids.get(id) ?? id),
    acceptanceCriteria: task.acceptanceCriteria ?? [],
  }));
}

export function mergeChatTasks(
  project: Project,
  chatId: string,
  generated: Task[],
): Task[] {
  const otherTasks = project.tasks.filter((task) => task.chatId !== chatId);
  const done = project.tasks.filter(
    (task) => task.chatId === chatId && task.status === "done",
  );
  const doneIds = new Set(done.map((task) => task.id));
  const fresh = generated.filter((task) => !doneIds.has(task.id));
  const tasks = [...otherTasks, ...done, ...fresh];

  validatePlan(tasks);
  return tasks;
}

function reactivateForNewTasks(project: Project, tasks: Task[]): Project {
  const hasPending = tasks.some((task) => task.status !== "done");
  const updated: Project = { ...project, tasks, updatedAt: new Date() };

  if (hasPending && REACTIVATABLE_STATUSES.has(project.status)) {
    updated.status = "ready";
    delete updated.finishedAt;
    delete updated.resultBranch;
    delete updated.resultCommit;
  }

  return updated;
}

async function loadProject(projectId: string, deps: ProjectDeps): Promise<Project> {
  const project = await deps.storage.getProject(projectId);

  if (!project) {
    throw new Error(`Proyecto ${projectId} no encontrado.`);
  }

  return project;
}

async function loadChat(
  projectId: string,
  chatId: string,
  deps: ProjectDeps,
): Promise<Chat> {
  const chat = await deps.storage.getChat(chatId);

  if (!chat || chat.projectId !== projectId) {
    throw new Error(`Chat ${chatId} no encontrado.`);
  }

  return chat;
}

export async function createChat(
  projectId: string,
  input: CreateChatInput,
  deps: ProjectDeps,
): Promise<Chat> {
  const project = await loadProject(projectId, deps);

  if (project.status === "running") {
    throw new Error(
      "No se puede crear un chat mientras el proyecto se está ejecutando.",
    );
  }

  const chats = await deps.storage.listChats(projectId);
  const seq = chats.reduce((max, chat) => Math.max(max, chat.seq), 0) + 1;
  const now = new Date();
  const title =
    input.title?.trim() ||
    (input.message ? deriveChatTitle(input.message) : `Chat ${seq}`);

  const chat: Chat = {
    id: randomUUID(),
    projectId,
    title,
    seq,
    createdAt: now,
    updatedAt: now,
  };

  await deps.storage.saveChat(chat);
  await emitProjectEvent(deps.storage, projectId, "chat.created", undefined, {
    chatId: chat.id,
    title: chat.title,
  });

  return chat;
}

export async function listChats(
  projectId: string,
  deps: ProjectDeps,
): Promise<ChatSummaryResult[]> {
  const project = await loadProject(projectId, deps);
  const chats = await deps.storage.listChats(projectId);
  const results: ChatSummaryResult[] = [];

  for (const chat of chats) {
    const messages = await deps.storage.listChatMessages(chat.id);
    results.push({
      chat,
      messageCount: messages.length,
      taskIds: project.tasks
        .filter((task) => task.chatId === chat.id)
        .map((task) => task.id),
    });
  }

  return results;
}

export async function getChatDetail(
  projectId: string,
  chatId: string,
  deps: ProjectDeps,
): Promise<ChatDetailResult> {
  const project = await loadProject(projectId, deps);
  const chat = await loadChat(projectId, chatId, deps);
  const messages = await deps.storage.listChatMessages(chatId);

  return {
    chat,
    messages,
    taskIds: project.tasks
      .filter((task) => task.chatId === chatId)
      .map((task) => task.id),
  };
}

export async function deleteChat(
  projectId: string,
  chatId: string,
  deps: ProjectDeps,
): Promise<Chat> {
  const chat = await loadChat(projectId, chatId, deps);
  const project = await loadProject(projectId, deps);

  await deps.storage.deleteChat(chatId);

  const tasks = project.tasks.filter((task) => task.chatId !== chatId);

  if (tasks.length !== project.tasks.length) {
    validatePlan(tasks);
    await deps.storage.saveProject({
      ...project,
      tasks,
      updatedAt: new Date(),
    });
  }

  await emitProjectEvent(deps.storage, projectId, "chat.deleted", undefined, {
    chatId,
  });

  return chat;
}

export interface SendChatMessageResult {
  chat: Chat;
  project: Project;
}

export async function sendChatMessage(
  projectId: string,
  chatId: string,
  content: string,
  deps: ProjectDeps,
): Promise<SendChatMessageResult> {
  const project = await loadProject(projectId, deps);

  if (project.status === "running") {
    throw new Error(
      "No se puede enviar un mensaje mientras el proyecto se está ejecutando.",
    );
  }

  const chat = await loadChat(projectId, chatId, deps);
  const trimmed = content.trim();

  if (!trimmed) {
    throw new Error("El mensaje no puede estar vacío.");
  }

  const config = project.config ?? deps.config ?? defaultConfig;
  const history = await deps.storage.listChatMessages(chatId);

  const userMessage: ChatMessage = {
    id: randomUUID(),
    chatId,
    projectId,
    role: "user",
    content: trimmed,
    taskIds: [],
    createdAt: new Date(),
  };

  await deps.storage.appendChatMessage(userMessage);
  await emitProjectEvent(deps.storage, projectId, "chat.message", undefined, {
    chatId,
    messageId: userMessage.id,
    role: "user",
  });

  const chatTasks = project.tasks.filter((task) => task.chatId === chatId);

  const context: PlanContext = {
    conversation: [
      ...history.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      { role: "user", content: trimmed },
    ],
    instructions: trimmed,
  };

  if (chatTasks.length > 0) {
    context.previousPlan = {
      summary: chat.title,
      tasks: chatTasks.map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        type: task.type,
        complexity: task.complexity,
        dependsOn: task.dependsOn ?? [],
        acceptanceCriteria: task.acceptanceCriteria ?? [],
      })),
    };
  }

  const completedTaskIds = chatTasks
    .filter((task) => task.status === "done")
    .map((task) => task.id);

  if (completedTaskIds.length > 0) {
    context.completedTaskIds = completedTaskIds;
  }

  try {
    const plan = await planProject(project.goal, context, {
      execute: deps.plannerExecute,
      agent: config.plannerAgent,
      maxAttempts: config.plannerMaxAttempts,
    });

    const generated = remapChatTasks(plan, chat.seq, chatId);
    const tasks = mergeChatTasks(project, chatId, generated);
    const updatedProject = reactivateForNewTasks(project, tasks);
    const generatedIds = generated.map((task) => task.id);

    await deps.storage.saveProject(updatedProject);

    const assistantMessage: ChatMessage = {
      id: randomUUID(),
      chatId,
      projectId,
      role: "assistant",
      content: plan.summary,
      taskIds: generatedIds,
      agent: config.plannerAgent,
      createdAt: new Date(),
    };

    await deps.storage.appendChatMessage(assistantMessage);
    await deps.storage.saveChat({ ...chat, updatedAt: new Date() });

    await emitProjectEvent(deps.storage, projectId, "chat.message", undefined, {
      chatId,
      messageId: assistantMessage.id,
      role: "assistant",
      taskIds: generatedIds,
    });
    await emitProjectEvent(deps.storage, projectId, "plan.updated", undefined, {
      action: "chat",
      chatId,
      taskIds: generatedIds,
    });

    return {
      chat: (await deps.storage.getChat(chatId)) ?? chat,
      project: updatedProject,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    const assistantMessage: ChatMessage = {
      id: randomUUID(),
      chatId,
      projectId,
      role: "assistant",
      content: `No pude generar el plan: ${message}`,
      taskIds: [],
      agent: config.plannerAgent,
      error: message,
      createdAt: new Date(),
    };

    await deps.storage.appendChatMessage(assistantMessage);
    await deps.storage.saveChat({ ...chat, updatedAt: new Date() });
    await emitProjectEvent(deps.storage, projectId, "chat.message", undefined, {
      chatId,
      messageId: assistantMessage.id,
      role: "assistant",
      error: message,
    });

    return {
      chat: (await deps.storage.getChat(chatId)) ?? chat,
      project,
    };
  }
}
