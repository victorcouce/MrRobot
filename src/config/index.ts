import {
  CLAUDE_OPUS,
  DEEPSEEK_FLASH,
} from "../agents/selector.js";
import type { OrchestratorConfig } from "./types.js";

export const defaultConfig: OrchestratorConfig = {
  concurrency: 2,
  maxRetriesPerAgent: 1,
  maxReviewFixCycles: 2,
  plannerMaxAttempts: 2,

  plannerAgent: CLAUDE_OPUS,
  reviewerAgent: CLAUDE_OPUS,
  supervisorAgent: CLAUDE_OPUS,

  checks: { commands: [] },
  defaultAllowedAgents: [],
};

export const fallbackCodingAgent = DEEPSEEK_FLASH;

export function loadConfig(
  overrides: Partial<OrchestratorConfig> = {},
): OrchestratorConfig {
  return {
    ...defaultConfig,
    ...overrides,
    checks: { ...defaultConfig.checks, ...overrides.checks },
  };
}

export function mergeConfig(
  base: OrchestratorConfig,
  overrides: Partial<OrchestratorConfig>,
): OrchestratorConfig {
  return {
    ...base,
    ...overrides,
    checks: { ...base.checks, ...(overrides.checks ?? {}) },
  };
}

export type { OrchestratorConfig } from "./types.js";
