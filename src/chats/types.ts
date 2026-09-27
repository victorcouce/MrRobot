import type { AgentSpec, Attachment } from "../agents/types.js";

export type ChatMessageRole = "user" | "assistant";

export interface Chat {
  id: string;
  /** Sin proyecto es un chat suelto: conversación sin repo ni tareas. */
  projectId?: string;
  title: string;
  /** Prefijo de sus tareas dentro del proyecto (`C<seq>`); 0 si es suelto. */
  seq: number;
  allowedAgents?: AgentSpec[];
  pinned?: boolean;
  archivedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  projectId?: string;
  role: ChatMessageRole;
  content: string;
  taskIds: string[];
  attachments?: Attachment[];
  agent?: AgentSpec;
  error?: string;
  createdAt: Date;
}
