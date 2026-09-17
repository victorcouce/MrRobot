import type { Task, TaskComplexity } from "../tasks/types.js";
import {
  agentKey,
  CLAUDE_OPUS,
  CLAUDE_SONNET,
  CODEX,
  DEEPSEEK_FLASH,
} from "./selector.js";
import type { AgentCandidate } from "./types.js";

export const MAX_RETRIES_PER_AGENT = 1;

function isHigh(complexity: TaskComplexity): boolean {
  return complexity === "high" || complexity === "critical";
}

function codingChain(complexity: TaskComplexity): AgentCandidate[] {
  switch (complexity) {
    case "low":
      return [DEEPSEEK_FLASH, CLAUDE_SONNET, CODEX];
    case "medium":
      return [CLAUDE_SONNET, CODEX, DEEPSEEK_FLASH];
    case "high":
      return [CODEX, CLAUDE_SONNET, CLAUDE_OPUS];
    case "critical":
      return [CODEX, CLAUDE_OPUS, CLAUDE_SONNET];
  }
}

function planningChain(complexity: TaskComplexity): AgentCandidate[] {
  return isHigh(complexity)
    ? [CLAUDE_OPUS, CODEX, CLAUDE_SONNET]
    : [CLAUDE_SONNET, DEEPSEEK_FLASH, CODEX];
}

function reviewChain(complexity: TaskComplexity): AgentCandidate[] {
  return isHigh(complexity)
    ? [CLAUDE_OPUS, CODEX, CLAUDE_SONNET]
    : [CLAUDE_SONNET, CODEX, DEEPSEEK_FLASH];
}

function testingChain(complexity: TaskComplexity): AgentCandidate[] {
  return complexity === "low"
    ? [DEEPSEEK_FLASH, CLAUDE_SONNET, CODEX]
    : [CLAUDE_SONNET, CODEX, DEEPSEEK_FLASH];
}

function researchChain(complexity: TaskComplexity): AgentCandidate[] {
  switch (complexity) {
    case "low":
      return [DEEPSEEK_FLASH, CLAUDE_SONNET, CLAUDE_OPUS];
    case "medium":
      return [CLAUDE_SONNET, DEEPSEEK_FLASH, CLAUDE_OPUS];
    case "high":
    case "critical":
      return [CLAUDE_OPUS, CLAUDE_SONNET, DEEPSEEK_FLASH];
  }
}

function autoChain(task: Task): AgentCandidate[] {
  switch (task.type) {
    case "architecture":
      return [CLAUDE_OPUS, CODEX, CLAUDE_SONNET];
    case "planning":
      return planningChain(task.complexity);
    case "coding":
      return codingChain(task.complexity);
    case "review":
      return reviewChain(task.complexity);
    case "testing":
      return testingChain(task.complexity);
    case "research":
      return researchChain(task.complexity);
  }
}

function dedupe(candidates: AgentCandidate[]): AgentCandidate[] {
  const seen = new Set<string>();
  const result: AgentCandidate[] = [];

  for (const candidate of candidates) {
    const key = agentKey(candidate);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(candidate);
  }

  return result;
}

/**
 * Restringe la cadena a los agentes permitidos del chat conservando el orden de
 * preferencia automático. Los permitidos que la cadena no contemplaba se añaden
 * al final, así el filtro nunca deja una tarea sin candidatos.
 */
function restrictToAllowed(
  chain: AgentCandidate[],
  allowed: AgentCandidate[],
): AgentCandidate[] {
  if (allowed.length === 0) {
    return chain;
  }

  const allowedKeys = new Set(allowed.map(agentKey));

  return dedupe([
    ...chain.filter((candidate) => allowedKeys.has(agentKey(candidate))),
    ...allowed,
  ]);
}

/**
 * `allowed` son los agentes permitidos del chat al que pertenece la tarea. Una
 * lista vacía significa "sin restricción". El agente fijado a mano en la tarea
 * también se filtra: la restricción del chat manda.
 */
export function getFallbackChain(
  task: Task,
  allowed: AgentCandidate[] = [],
): AgentCandidate[] {
  const auto = autoChain(task);
  const chain = task.agent ? dedupe([task.agent, ...auto]) : auto;

  return restrictToAllowed(chain, allowed);
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

const NON_RETRYABLE_PATTERNS = [
  "api key",
  "apikey",
  "unauthorized",
  "forbidden",
  "401",
  "403",
  "not found",
  "enoent",
  "command not found",
  "invalid model",
  "unknown model",
  "invalid_request",
  "invalid request",
  "400",
];

const RETRYABLE_PATTERNS = [
  "timeout",
  "timed out",
  "etimedout",
  "econnreset",
  "econnrefused",
  "enotfound",
  "eai_again",
  "network",
  "connection",
  "disconnected",
  "socket hang up",
  "rate limit",
  "rate_limit",
  "too many requests",
  "429",
  "500",
  "502",
  "503",
  "504",
  "internal server error",
  "service unavailable",
  "bad gateway",
  "gateway timeout",
  "temporarily",
  "temporary",
  "unavailable",
  "overloaded",
  "try again",
  "terminated",
  "killed",
  "sigterm",
  "sigkill",
];

export function isRetryableError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();

  if (NON_RETRYABLE_PATTERNS.some((pattern) => message.includes(pattern))) {
    return false;
  }

  return RETRYABLE_PATTERNS.some((pattern) => message.includes(pattern));
}
