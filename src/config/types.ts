import type { LimitRetryPolicy } from "../agents/limit-retry.js";
import type { AgentCandidate } from "../agents/types.js";
import type { HarnessConfig } from "../harness/types.js";

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

  /**
   * Harness agéntico para DeepSeek. Ausente = valores por defecto
   * (enabled: true, bounds y sandbox defaults).
   */
  harness?: HarnessConfig;

  /**
   * Modo rápido: el planner no crea tareas de tests y las tareas no pasan por
   * checks ni reviewer (se dan por buenas si el agente escribe cambios).
   */
  fastMode?: boolean;

  /**
   * Ejecuta el plan en cuanto se genera, sin esperar a que el usuario lo
   * apruebe. Solo afecta al plan inicial, no a las replanificaciones del chat.
   */
  autoRun?: boolean;
}
