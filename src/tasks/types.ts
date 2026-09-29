import type { AgentCandidate, AgentSpec } from "../agents/types.js";
import type { IntegrationError } from "../workspace/types.js";

export type TaskStatus =
  | "todo"
  | "blocked"
  | "ready"
  | "running"
  | "interrupted"
  | "done"
  | "failed";

export type TaskType =
  | "planning"
  | "architecture"
  | "coding"
  | "review"
  | "testing"
  | "research";

export type TaskComplexity = "low" | "medium" | "high" | "critical";

export interface TaskAttempt {
  agent: AgentCandidate;

  attempt: number;

  startedAt: Date;
  finishedAt: Date;

  status: "success" | "failed";

  error?: string;

  workspacePath?: string;
  branchName?: string;
  baseRef?: string;
  commitSha?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;

  type: TaskType;
  complexity: TaskComplexity;

  chatId?: string;

  dependsOn?: string[];
  blockedReason?: string;

  acceptanceCriteria?: string[];
  /** Ids de los adjuntos del chat que esta tarea necesita. */
  attachmentIds?: string[];
  integrationError?: IntegrationError;

  agent?: AgentSpec;
  executedBy?: AgentSpec;

  attempts?: TaskAttempt[];
  resultCommit?: string;

  output?: string;
  error?: string;

  startedAt?: Date;
  finishedAt?: Date;
}
