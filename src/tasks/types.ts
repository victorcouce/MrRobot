import type { AgentCandidate, AgentSpec } from "../agents/types.js";

export type TaskStatus =
  | "todo"
  | "blocked"
  | "ready"
  | "running"
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

  dependsOn?: string[];
  blockedReason?: string;

  agent?: AgentSpec;
  executedBy?: AgentSpec;

  attempts?: TaskAttempt[];
  resultCommit?: string;

  output?: string;
  error?: string;

  startedAt?: Date;
  finishedAt?: Date;
}
