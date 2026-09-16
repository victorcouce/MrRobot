import type { Task, TaskComplexity } from "../tasks/types.js";
import type { AgentSpec } from "./types.js";

export type AgentSelection = AgentSpec;

const DEEPSEEK_FLASH: AgentSelection = {
  provider: "deepseek",
  model: "deepseek-flash",
};
const CLAUDE_SONNET: AgentSelection = {
  provider: "claude",
  model: "sonnet",
};
const CLAUDE_OPUS: AgentSelection = { provider: "claude", model: "opus" };
const CODEX: AgentSelection = { provider: "codex" };

function isHigh(complexity: TaskComplexity): boolean {
  return complexity === "high" || complexity === "critical";
}

function selectCoding(complexity: TaskComplexity): AgentSelection {
  switch (complexity) {
    case "low":
      return DEEPSEEK_FLASH;
    case "medium":
      return CLAUDE_SONNET;
    case "high":
    case "critical":
      return CODEX;
  }
}

function selectResearch(complexity: TaskComplexity): AgentSelection {
  switch (complexity) {
    case "low":
      return DEEPSEEK_FLASH;
    case "medium":
      return CLAUDE_SONNET;
    case "high":
    case "critical":
      return CLAUDE_OPUS;
  }
}

export function selectAgent(task: Task): AgentSelection {
  switch (task.type) {
    case "architecture":
      return CLAUDE_OPUS;
    case "planning":
      return isHigh(task.complexity) ? CLAUDE_OPUS : CLAUDE_SONNET;
    case "coding":
      return selectCoding(task.complexity);
    case "review":
      return isHigh(task.complexity) ? CLAUDE_OPUS : CLAUDE_SONNET;
    case "testing":
      return task.complexity === "low" ? DEEPSEEK_FLASH : CLAUDE_SONNET;
    case "research":
      return selectResearch(task.complexity);
  }
}

export function resolveAgent(task: Task): AgentSelection {
  return task.agent ?? selectAgent(task);
}

export function describeAgent(agent: AgentSelection): string {
  if (agent.provider === "codex") {
    return agent.provider;
  }

  return agent.model ? `${agent.provider} / ${agent.model}` : agent.provider;
}
