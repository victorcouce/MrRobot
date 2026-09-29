import { randomUUID } from "node:crypto";
import { resolveAttachmentRefs } from "../agents/attachments.js";
import type { Attachment } from "../agents/types.js";
import { assertFileWritingAgent } from "../agents/selector.js";
import { defaultConfig } from "../config/index.js";
import { createAgentEventEmitter } from "../logging/agent-events.js";
import { planProject } from "../planner/planner.js";
import type {
  GeneratedPlan,
  PlanContext,
} from "../planner/types.js";
import {
  emitInvalidPlan,
  emitProjectEvent,
  type ProjectDeps,
} from "../projects/service.js";
import type { Project } from "../projects/types.js";
import type { AgentSpec } from "../agents/types.js";
import { validatePlan } from "../scheduler/validation.js";
import type { Task } from "../tasks/types.js";
import { converse, type ConversationDeps } from "./conversation.js";
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

const DEFAULT_CHAT_TITLE = "Nuevo chat";

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
    const tasks = chat.projectId ? (tasksByProject.get(chat.projectId) ?? []) : [];
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

  if (project.config?.fastMode) context.fastMode = true;

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
    let plannerAgentUsed: AgentSpec | undefined;
    const onPlannerAgentEvent = createAgentEventEmitter(
      deps.storage,
      projectId,
      "planner",
    );

    const plan = await planProject(project.goal, context, {
      execute: deps.plannerExecute,
      ...(chat.allowedAgents?.length
        ? { allowedAgents: chat.allowedAgents }
        : project.defaultAllowedAgents?.length
          ? { allowedAgents: project.defaultAllowedAgents }
          : {}),
      maxAttempts: config.plannerMaxAttempts,
      maxRetriesPerAgent: config.maxRetriesPerAgent,
      ...(config.limitRetry ? { limitRetry: config.limitRetry } : {}),
      onAgent: (agent) => {
        plannerAgentUsed = agent;
      },
      onAgentEvent: (info) => onPlannerAgentEvent(undefined, info),
      onInvalidPlan: (attempt, problem) =>
        emitInvalidPlan(deps.storage, projectId, attempt, problem),
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
      ...(plannerAgentUsed ? { agent: plannerAgentUsed } : {}),
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
  assertFileWritingAgent(agents);

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

type IncomingAttachment = NonNullable<CreateChatInput["attachments"]>[number];

function toAttachments(attachments: IncomingAttachment[] | undefined): Attachment[] {
  return (
    attachments?.map((att) => ({
      id: randomUUID(),
      name: att.name,
      type: att.type,
      mimeType: att.mimeType,
      size: att.size,
      data: att.data,
      createdAt: new Date(),
    })) ?? []
  );
}

export async function loadChatById(chatId: string, deps: ProjectDeps): Promise<Chat> {
  const chat = await deps.storage.getChat(chatId);

  if (!chat) {
    throw new Error(`Chat ${chatId} no encontrado.`);
  }

  return chat;
}

async function chatTaskIds(chat: Chat, deps: ProjectDeps): Promise<string[]> {
  if (!chat.projectId) return [];
  const project = await deps.storage.getProject(chat.projectId);
  return (project?.tasks ?? [])
    .filter((task) => task.chatId === chat.id)
    .map((task) => task.id);
}

export async function getChatDetailById(
  chatId: string,
  deps: ProjectDeps,
): Promise<ChatDetailResult> {
  const chat = await loadChatById(chatId, deps);
  const messages = await deps.storage.listChatMessages(chatId);
  return { chat, messages, taskIds: await chatTaskIds(chat, deps) };
}

/** Chat suelto: sin proyecto, sin repo y sin tareas. Solo conversación. */
export async function createStandaloneChat(
  input: Pick<CreateChatInput, "title" | "message">,
  deps: ProjectDeps,
  allowedAgents?: AgentSpec[],
): Promise<Chat> {
  const now = new Date();
  const chat: Chat = {
    id: randomUUID(),
    title:
      input.title?.trim() ||
      (input.message ? deriveChatTitle(input.message) : DEFAULT_CHAT_TITLE),
    seq: 0,
    createdAt: now,
    updatedAt: now,
  };

  if (allowedAgents?.length) chat.allowedAgents = allowedAgents;

  await deps.storage.saveChat(chat);
  return chat;
}

export async function sendStandaloneMessage(
  chatId: string,
  content: string,
  attachments: IncomingAttachment[] | undefined,
  deps: ProjectDeps,
  conversation: ConversationDeps,
): Promise<Chat> {
  const chat = await loadChatById(chatId, deps);

  if (chat.projectId) {
    throw new Error("Este chat pertenece a un proyecto.");
  }

  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("El mensaje no puede estar vacío.");
  }

  const history = await deps.storage.listChatMessages(chatId);
  const processed = toAttachments(attachments);

  await deps.storage.appendChatMessage({
    id: randomUUID(),
    chatId,
    role: "user",
    content: trimmed,
    taskIds: [],
    ...(processed.length > 0 ? { attachments: processed } : {}),
    createdAt: new Date(),
  });

  const chatAttachments = [
    ...history.flatMap((message) => message.attachments ?? []),
    ...processed,
  ];

  let reply: ChatMessage;
  try {
    let agentUsed: AgentSpec | undefined;
    const content = await converse(
      [
        ...history.map((message) => ({ role: message.role, content: message.content })),
        { role: "user" as const, content: trimmed },
      ],
      {
        ...conversation,
        ...(chat.allowedAgents?.length ? { allowedAgents: chat.allowedAgents } : {}),
        ...(chatAttachments.length > 0 ? { attachments: chatAttachments } : {}),
        onAgent: (agent) => {
          agentUsed = agent;
        },
      },
    );
    reply = {
      id: randomUUID(),
      chatId,
      role: "assistant",
      content,
      taskIds: [],
      ...(agentUsed ? { agent: agentUsed } : {}),
      createdAt: new Date(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    reply = {
      id: randomUUID(),
      chatId,
      role: "assistant",
      content: `No pude responder: ${message}`,
      taskIds: [],
      error: message,
      createdAt: new Date(),
    };
  }

  await deps.storage.appendChatMessage(reply);
  const updated: Chat = { ...chat, updatedAt: new Date() };
  // Como en ChatGPT: el chat nace sin nombre y lo toma de su primer mensaje.
  if (history.length === 0 && chat.title === DEFAULT_CHAT_TITLE) {
    updated.title = deriveChatTitle(trimmed);
  }
  await deps.storage.saveChat(updated);
  return updated;
}

export interface ChatPatch {
  title?: string;
  pinned?: boolean;
  archived?: boolean;
  /** `null` saca el chat de su proyecto (pasa a ser suelto). */
  projectId?: string | null;
}

/**
 * Renombrar, fijar, archivar y mover de proyecto. Un chat que ya generó tareas
 * no se mueve: sus tareas viven en el plan de su proyecto y dependen de él.
 */
export async function updateChat(
  chatId: string,
  patch: ChatPatch,
  deps: ProjectDeps,
): Promise<Chat> {
  const chat = await loadChatById(chatId, deps);
  const updated: Chat = { ...chat };

  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) throw new Error("El título no puede estar vacío.");
    updated.title = title;
  }

  if (patch.pinned !== undefined) {
    if (patch.pinned) updated.pinned = true;
    else delete updated.pinned;
  }

  if (patch.archived !== undefined) {
    if (patch.archived) updated.archivedAt = chat.archivedAt ?? new Date();
    else delete updated.archivedAt;
  }

  const target = patch.projectId === null ? undefined : patch.projectId;
  const moving = patch.projectId !== undefined && target !== chat.projectId;

  if (moving) {
    if (chat.projectId) {
      const source = await deps.storage.getProject(chat.projectId);
      const tasks = (source?.tasks ?? []).filter((task) => task.chatId === chat.id);
      if (tasks.length > 0) {
        throw new Error(
          `No se puede mover este chat: ya generó tareas en «${source?.title || source?.goal || source?.name}».`,
        );
      }
    }

    if (target) {
      const project = await loadProject(target, deps);
      if (project.status === "running") {
        throw new Error(
          "No se puede mover un chat a un proyecto que se está ejecutando.",
        );
      }
      const chats = await deps.storage.listChats(target);
      updated.projectId = target;
      updated.seq = chats.reduce((max, other) => Math.max(max, other.seq), 0) + 1;
      if (!updated.allowedAgents?.length && project.defaultAllowedAgents?.length) {
        updated.allowedAgents = project.defaultAllowedAgents;
      }
    } else {
      delete updated.projectId;
      updated.seq = 0;
    }
  }

  // Renombrar o mover cuenta como actividad; fijar y archivar no reordenan.
  if (patch.title !== undefined || moving) {
    updated.updatedAt = new Date();
  }

  await deps.storage.saveChat(updated);

  if (moving) {
    await deps.storage.setChatMessagesProject(chatId, updated.projectId);
    if (chat.projectId) {
      await emitProjectEvent(deps.storage, chat.projectId, "chat.deleted", undefined, {
        chatId,
      });
    }
    if (updated.projectId) {
      await emitProjectEvent(deps.storage, updated.projectId, "chat.created", undefined, {
        chatId,
        title: updated.title,
      });
    }
  } else if (updated.projectId) {
    await emitProjectEvent(deps.storage, updated.projectId, "chat.updated", undefined, {
      chatId,
    });
  }

  return updated;
}

export async function deleteChatById(chatId: string, deps: ProjectDeps): Promise<Chat> {
  const chat = await loadChatById(chatId, deps);

  if (chat.projectId) {
    return deleteChat(chat.projectId, chatId, deps);
  }

  await deps.storage.deleteChat(chatId);
  return chat;
}
