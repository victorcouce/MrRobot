import { runClaude } from "../providers/claude.js";
import { runCodex } from "../providers/codex.js";
import { runDeepSeek } from "../providers/deepseek.js";
import type { AgentSpec } from "./types.js";

export function runAgent(prompt: string, agent: AgentSpec): Promise<string> {
  switch (agent.provider) {
    case "codex":
      return runCodex(prompt);
    case "claude":
      return runClaude(prompt, agent.model);
    case "deepseek":
      return runDeepSeek(prompt, agent.model);
    default: {
      const unsupported: never = agent;
      throw new Error(`Proveedor no soportado: ${String(unsupported)}`);
    }
  }
}
