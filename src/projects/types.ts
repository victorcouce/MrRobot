import type { OrchestratorConfig } from "../config/types.js";
import type { Task } from "../tasks/types.js";

export type ProjectStatus =
  | "draft"
  | "planning"
  | "ready"
  | "running"
  | "paused"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled";

export interface Project {
  id: string;
  name: string;
  goal: string;

  status: ProjectStatus;

  baseRef: string;

  repoPath?: string;
  remoteUrl?: string;

  tasks: Task[];

  config?: OrchestratorConfig;

  createdAt: Date;
  updatedAt: Date;

  startedAt?: Date;
  finishedAt?: Date;

  resultBranch?: string;
  resultCommit?: string;
}

export interface ProjectResult {
  projectId: string;
  status: "completed";

  branchName: string;
  commitSha: string;

  completedTasks: number;
  failedTasks: number;

  startedAt: Date;
  finishedAt: Date;
}
