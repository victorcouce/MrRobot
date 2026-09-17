import type { AgentCandidate } from "../agents/types.js";

export interface ChecksConfig {
  commands: string[];
}

export interface OrchestratorConfig {
  concurrency: number;
  maxRetriesPerAgent: number;
  maxReviewFixCycles: number;
  plannerMaxAttempts: number;

  plannerAgent: AgentCandidate;
  reviewerAgent: AgentCandidate;
  supervisorAgent: AgentCandidate;

  checks: ChecksConfig;

  /**
   * Agentes que vienen marcados al crear un proyecto. Ausente o vacío = todos.
   * Opcional porque hay configuraciones guardadas de antes de que existiera.
   */
  defaultAllowedAgents?: AgentCandidate[];
}
