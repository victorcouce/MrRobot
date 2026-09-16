import type { AgentSpec } from "../agents/types.js";

export type ChatMessageRole = "user" | "assistant";

export interface Chat {
  id: string;
  projectId: string;
  title: string;
  seq: number;
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
  agent?: AgentSpec;
  error?: string;
  createdAt: Date;
}
