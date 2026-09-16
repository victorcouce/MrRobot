import type { Task } from "../tasks/types.js";

export type PlanStatus = "completed" | "failed" | "blocked" | "paused" | "cancelled";

export interface PlanResult {
  status: PlanStatus;
  tasks: Task[];
  startedAt: Date;
  finishedAt: Date;
  failedTaskIds?: string[];
  blockedTaskIds?: string[];
}
