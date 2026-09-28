import { runClaude } from "../providers/claude.js";
import { runCodex } from "../providers/codex.js";
import { runDeepSeek, runDeepSeekAgentic } from "../providers/deepseek.js";
import { runLmStudio, runLmStudioAgentic } from "../providers/lmstudio.js";
import type { RunOptions } from "../providers/types.js";
import type { AgentSpec } from "./types.js";

/**
 * Resuelve si un agente debe ejecutar en modo "agentic" (bucle de herramientas)
 * o "text" (chat simple).
 * - CLIs (Codex, Claude) ignoran el modo: traen su propio bucle.
 * - DeepSeek/LM Studio: modo explícito, sin `cwd` → text, `sandbox: read-only` → text.
 */
export function resolveRunMode(options: RunOptions): "text" | "agentic" {
  if (options.mode !== "agentic") return "text";
  if (!options.cwd) return "text"; // sin raíz no hay sandbox
  if (options.sandbox === "read-only") return "text"; // veto absoluto
  return "agentic";
}

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
    case "deepseek": {
      const mode = resolveRunMode(options);
      if (mode === "agentic" && options.cwd) {
        return runDeepSeekAgentic({
          ...options,
          cwd: options.cwd,
          prompt,
          agent,
        }).then((result) => result.text);
      }
      return runDeepSeek(prompt, agent.model);
    }
    case "lmstudio": {
      const mode = resolveRunMode(options);
      if (mode === "agentic" && options.cwd) {
        return runLmStudioAgentic({
          ...options,
          cwd: options.cwd,
          prompt,
          agent,
        }).then((result) => result.text);
      }
      return runLmStudio(prompt, agent.model);
    }
    default: {
      const unsupported: never = agent;
      throw new Error(`Proveedor no soportado: ${String(unsupported)}`);
    }
  }
}
