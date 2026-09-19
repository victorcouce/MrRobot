import { DEFAULT_LIMIT_RETRY } from "../agents/limit-retry.js";
import { DEEPSEEK_FLASH } from "../agents/selector.js";
import type { OrchestratorConfig } from "./types.js";

export const defaultConfig: OrchestratorConfig = {
  concurrency: 2,
  maxConcurrency: 4,
  maxRetriesPerAgent: 1,
  maxReviewFixCycles: 2,
  plannerMaxAttempts: 2,

  limitRetry: DEFAULT_LIMIT_RETRY,

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
