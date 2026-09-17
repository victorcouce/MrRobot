import { randomUUID } from "node:crypto";
import { resolveAttachmentRefs } from "../agents/attachments.js";
import type { Attachment } from "../agents/types.js";
import { defaultConfig } from "../config/index.js";
import { planProject } from "../planner/planner.js";
import type {
  GeneratedPlan,
  PlanContext,
} from "../planner/types.js";
import { emitProjectEvent, type ProjectDeps } from "../projects/service.js";
import type { Project } from "../projects/types.js";
import type { AgentSpec } from "../agents/types.js";
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
  /** Adjuntos del primer mensaje, cuando el chat nace con uno. */
  attachments?: Array<{
    name: string;
    type: "image" | "markdown";
    mimeType: string;
    size: number;
    data: string;
  }>;
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
  attachments: Attachment[] = [],
): Task[] {
  const prefix = chatPrefix(seq);
  const ids = new Map<string, string>();

  for (const task of plan.tasks) {
    ids.set(task.id, `${prefix}-${task.id}`);
  }

  return plan.tasks.map((task) => {
    const remapped: Task = {
      id: ids.get(task.id) as string,
      title: task.title,
      description: task.description,
      status: "todo" as const,
      type: task.type,
      complexity: task.complexity,
      chatId,
      dependsOn: (task.dependsOn ?? []).map((id) => ids.get(id) ?? id),
      acceptanceCriteria: task.acceptanceCriteria ?? [],
    };

    const attachmentIds = resolveAttachmentRefs(
      task.attachments ?? [],
      attachments,
    );

    if (attachmentIds.length > 0) {
      remapped.attachmentIds = attachmentIds;
    }

    return remapped;
  });
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

  // Los chats nuevos arrancan con los agentes elegidos al crear el proyecto.
  if (project.defaultAllowedAgents?.length) {
    chat.allowedAgents = project.defaultAllowedAgents;
  }

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

export async function listAllChats(
  deps: ProjectDeps,
): Promise<ChatSummaryResult[]> {
  const projects = await deps.storage.listProjects();
  const chats = await deps.storage.listAllChats();
  const tasksByProject = new Map<string, Task[]>();

  for (const project of projects) {
    tasksByProject.set(project.id, project.tasks);
  }

  const results: ChatSummaryResult[] = [];

  for (const chat of chats) {
    const messages = await deps.storage.listChatMessages(chat.id);
    const tasks = tasksByProject.get(chat.projectId) ?? [];
    results.push({
      chat,
      messageCount: messages.length,
      taskIds: tasks
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
  attachments: Array<{
    name: string;
    type: "image" | "markdown";
    mimeType: string;
    size: number;
    data: string;
  }> | undefined,
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

  const processedAttachments: Attachment[] = attachments?.map((att) => ({
    id: randomUUID(),
    name: att.name,
    type: att.type,
    mimeType: att.mimeType,
    size: att.size,
    data: att.data,
    createdAt: new Date(),
  })) ?? [];

  const userMessage: ChatMessage = {
    id: randomUUID(),
    chatId,
    projectId,
    role: "user",
    content: trimmed,
    taskIds: [],
    ...(processedAttachments.length > 0 && { attachments: processedAttachments }),
    createdAt: new Date(),
  };

  await deps.storage.appendChatMessage(userMessage);
  await emitProjectEvent(deps.storage, projectId, "chat.message", undefined, {
    chatId,
    messageId: userMessage.id,
    role: "user",
  });

  const chatTasks = project.tasks.filter((task) => task.chatId === chatId);

  // El planner ve todos los adjuntos del chat, no solo los de este mensaje: un
  // mockup enviado hace tres turnos sigue siendo válido para las tareas nuevas.
  const chatAttachments = [
    ...history.flatMap((message) => message.attachments ?? []),
    ...processedAttachments,
  ];

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

  if (chatAttachments.length > 0) {
    context.attachments = chatAttachments;
  }

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
        attachments: [],
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

    const generated = remapChatTasks(plan, chat.seq, chatId, chatAttachments);
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

export async function updateChatAllowedAgents(
  projectId: string,
  chatId: string,
  agents: AgentSpec[],
  deps: ProjectDeps,
): Promise<Chat> {
  const chat = await loadChat(projectId, chatId, deps);
  const updated: Chat = {
    ...chat,
    updatedAt: new Date(),
  };

  // Una lista vacía significa "sin restricción": hay que borrar la anterior,
  // no conservarla.
  if (agents.length > 0) {
    updated.allowedAgents = agents;
  } else {
    delete updated.allowedAgents;
  }

  await deps.storage.saveChat(updated);
  await emitProjectEvent(deps.storage, projectId, "chat.updated", undefined, {
    chatId,
    allowedAgents: agents,
  });
  return updated;
}
