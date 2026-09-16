import type { AgentSpec } from "./types";

export type AgentChoice = "codex" | "claude-sonnet" | "claude-opus" | "deepseek";

export function agentToChoice(agent: AgentSpec | undefined): AgentChoice {
  if (!agent) return "claude-opus";
  if (agent.provider === "codex") return "codex";
  if (agent.provider === "deepseek") return "deepseek";
  return agent.model === "opus" ? "claude-opus" : "claude-sonnet";
}

export function choiceToAgent(choice: AgentChoice): AgentSpec {
  switch (choice) {
    case "codex":
      return { provider: "codex" };
    case "claude-sonnet":
      return { provider: "claude", model: "sonnet" };
    case "claude-opus":
      return { provider: "claude", model: "opus" };
    case "deepseek":
      return { provider: "deepseek", model: "deepseek-flash" };
  }
}

export const AGENT_CHOICES: Array<{ value: AgentChoice; label: string }> = [
  { value: "codex", label: "Codex" },
  { value: "claude-sonnet", label: "Claude Sonnet" },
  { value: "claude-opus", label: "Claude Opus" },
  { value: "deepseek", label: "DeepSeek" },
];

export function choiceLabel(choice: AgentChoice): string {
  return AGENT_CHOICES.find((item) => item.value === choice)?.label ?? choice;
}
