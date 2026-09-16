import type { AgentSpec } from "../agents/types.js";

export type TaskStatus = "todo" | "ready" | "running" | "done" | "failed";

export type TaskType =
  | "planning"
  | "architecture"
  | "coding"
  | "review"
  | "testing"
  | "research";

export type TaskComplexity = "low" | "medium" | "high" | "critical";

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;

  type: TaskType;
  complexity: TaskComplexity;

  agent?: AgentSpec;
  executedBy?: AgentSpec;

  output?: string;
  error?: string;

  startedAt?: Date;
  finishedAt?: Date;
}
