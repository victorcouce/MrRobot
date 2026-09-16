import type { DeepSeekModel } from "../providers/deepseek.js";

export type ClaudeModel = "sonnet" | "opus";

export type AgentSpec =
  | { provider: "codex" }
  | { provider: "claude"; model?: ClaudeModel }
  | { provider: "deepseek"; model?: DeepSeekModel };

export type AgentProvider = AgentSpec["provider"];

export type AgentCandidate = AgentSpec;
