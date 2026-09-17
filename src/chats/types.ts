import type { AgentSpec, Attachment } from "../agents/types.js";

export type ChatMessageRole = "user" | "assistant";

export interface Chat {
  id: string;
  projectId: string;
  title: string;
  seq: number;
  allowedAgents?: AgentSpec[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  projectId: string;
  role: ChatMessageRole;
  content: string;
  taskIds: string[];
  attachments?: Attachment[];
  agent?: AgentSpec;
  error?: string;
  createdAt: Date;
}
