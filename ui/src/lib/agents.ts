import type { AgentProvider, AgentSpec } from "./types";

export type AgentChoice =
  | "codex"
  | "claude-sonnet"
  | "claude-opus"
  | "claude-haiku"
  | "deepseek"
  | "deepseek-v4-pro";

export function agentToChoice(agent: AgentSpec | undefined): AgentChoice {
  if (!agent) return "claude-opus";
  if (agent.provider === "codex") return "codex";
  if (agent.provider === "deepseek") {
    return agent.model === "deepseek-v4-pro" ? "deepseek-v4-pro" : "deepseek";
  }
  if (agent.model === "opus") return "claude-opus";
  if (agent.model === "haiku") return "claude-haiku";
  return "claude-sonnet";
}

export function choiceToAgent(choice: AgentChoice): AgentSpec {
  switch (choice) {
    case "codex":
      return { provider: "codex" };
    case "claude-sonnet":
      return { provider: "claude", model: "sonnet" };
    case "claude-opus":
      return { provider: "claude", model: "opus" };
    case "claude-haiku":
      return { provider: "claude", model: "haiku" };
    case "deepseek":
      return { provider: "deepseek", model: "deepseek-flash" };
    case "deepseek-v4-pro":
      return { provider: "deepseek", model: "deepseek-v4-pro" };
  }
}

export const AGENT_CHOICES: Array<{ value: AgentChoice; label: string }> = [
  { value: "codex", label: "Codex (default)" },
  { value: "claude-sonnet", label: "Claude Sonnet" },
  { value: "claude-opus", label: "Claude Opus" },
  { value: "claude-haiku", label: "Claude Haiku" },
  { value: "deepseek", label: "DeepSeek Flash" },
  { value: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
];

export function choiceLabel(choice: AgentChoice): string {
  return AGENT_CHOICES.find((item) => item.value === choice)?.label ?? choice;
}

/** Etiqueta monoespaciada de un agente, como en el diseño (`claude / sonnet`). */
export function monoAgentLabel(agent: AgentSpec | undefined): string {
  if (!agent) return "auto";
  const match = CHAT_AGENT_OPTIONS.find((option) => sameAgent(option.spec, agent));
  if (match) return match.label;
  if (agent.provider === "codex") return "codex";
  if (agent.provider === "claude") return `claude / ${agent.model ?? "sonnet"}`;
  return agent.model ?? "deepseek-flash";
}

/** Identidad estable de un agente para comparar selecciones (provider + modelo). */
export function agentKey(agent: AgentSpec): string {
  if (agent.provider === "codex") return "codex";
  if (agent.provider === "claude") return `claude-${agent.model ?? "sonnet"}`;
  return `deepseek-${agent.model ?? "deepseek-flash"}`;
}

export function sameAgent(a: AgentSpec, b: AgentSpec): boolean {
  return agentKey(a) === agentKey(b);
}

/**
 * Solo Codex y Claude escriben en el worktree. DeepSeek solo devuelve texto, así
 * que una selección sin ninguno de los dos no puede completar tareas de código.
 */
const FILE_WRITING_PROVIDERS: ReadonlySet<AgentProvider> = new Set([
  "codex",
  "claude",
]);

export function canWriteFiles(agent: AgentSpec): boolean {
  return FILE_WRITING_PROVIDERS.has(agent.provider);
}

export function hasFileWritingAgent(agents: AgentSpec[]): boolean {
  return agents.some(canWriteFiles);
}

export interface ChatAgentOption {
  choice: AgentChoice;
  spec: AgentSpec;
  /** Etiqueta monoespaciada, como en el diseño (`claude / sonnet`). */
  label: string;
  /** Para qué destaca el agente. */
  hint: string;
}

/** Los seis agentes que ofrece el selector de agentes del chat. */
export const CHAT_AGENT_OPTIONS: ChatAgentOption[] = [
  {
    choice: "codex",
    spec: { provider: "codex" },
    label: "codex",
    hint: "código complejo",
  },
  {
    choice: "claude-sonnet",
    spec: { provider: "claude", model: "sonnet" },
    label: "claude / sonnet",
    hint: "equilibrado",
  },
  {
    choice: "claude-opus",
    spec: { provider: "claude", model: "opus" },
    label: "claude / opus",
    hint: "arquitectura",
  },
  {
    choice: "claude-haiku",
    spec: { provider: "claude", model: "haiku" },
    label: "claude / haiku",
    hint: "rápido y ligero",
  },
  {
    choice: "deepseek",
    spec: { provider: "deepseek", model: "deepseek-flash" },
    label: "deepseek-flash",
    hint: "rápido y económico",
  },
  {
    choice: "deepseek-v4-pro",
    spec: { provider: "deepseek", model: "deepseek-v4-pro" },
    label: "deepseek-v4-pro",
    hint: "máxima calidad",
  },
];
