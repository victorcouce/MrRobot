import { runClaude } from "../providers/claude.js";
import { runCodex } from "../providers/codex.js";
import { runDeepSeek } from "../providers/deepseek.js";
import type { RunOptions } from "../providers/types.js";
import type { AgentSpec } from "./types.js";

export function runAgent(
  prompt: string,
  agent: AgentSpec,
  options: RunOptions = {},
): Promise<string> {
  switch (agent.provider) {
    case "codex":
      return runCodex(prompt, options);
    case "claude":
      return runClaude(prompt, agent.model, options);
    case "deepseek":
      return runDeepSeek(prompt, agent.model);
    default: {
      const unsupported: never = agent;
      throw new Error(`Proveedor no soportado: ${String(unsupported)}`);
    }
  }
}
