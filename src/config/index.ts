import { DEFAULT_LIMIT_RETRY } from "../agents/limit-retry.js";
import { CLAUDE_HAIKU } from "../agents/selector.js";
import type { OrchestratorConfig } from "./types.js";

export const defaultConfig: OrchestratorConfig = {
  // El scheduler despacha de forma continua y sube la concurrencia sola cuando
  // las tareas van saliendo bien, así que puede arrancar más alto: ante un
  // límite del proveedor la baja a la mitad por sí mismo.
  concurrency: 3,
  maxConcurrency: 6,
  maxRetriesPerAgent: 1,
  maxReviewFixCycles: 2,
  plannerMaxAttempts: 2,

  limitRetry: DEFAULT_LIMIT_RETRY,

  checks: { commands: [] },
  defaultAllowedAgents: [],
};

export const fallbackCodingAgent = CLAUDE_HAIKU;

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
