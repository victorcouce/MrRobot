import type { DeepSeekModel } from "../providers/deepseek.js";

export type ClaudeModel = "sonnet" | "opus" | "haiku";

export type AgentSpec =
  | { provider: "codex" }
  | { provider: "claude"; model?: ClaudeModel }
  | { provider: "deepseek"; model?: DeepSeekModel };

export type AgentProvider = AgentSpec["provider"];

export type AgentCandidate = AgentSpec;

export type AttachmentType = "image" | "markdown";

export interface Attachment {
  id: string;
  name: string;
  type: AttachmentType;
  mimeType: string;
  size: number;
  data?: string;
  createdAt: Date;
}
