import type { LimitRetryPolicy } from "../agents/limit-retry.js";
import type { AgentCandidate } from "../agents/types.js";

export interface ChecksConfig {
  commands: string[];
}

export interface OrchestratorConfig {
  concurrency: number;
  /** Tope de la concurrencia adaptativa (>= concurrency). */
  maxConcurrency?: number;
  maxRetriesPerAgent: number;
  maxReviewFixCycles: number;
  plannerMaxAttempts: number;

  /**
   * Reintento de la cadena completa cuando todos los agentes se agotan por
   * límite (rate limit o cuota/sesión). Ausente = valores por defecto.
   */
  limitRetry?: LimitRetryPolicy;

  checks: ChecksConfig;

  /**
   * Agentes que vienen marcados al crear un proyecto. Ausente o vacío = todos.
   * Opcional porque hay configuraciones guardadas de antes de que existiera.
   */
  defaultAllowedAgents?: AgentCandidate[];
}
