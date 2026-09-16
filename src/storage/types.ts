import type { Project } from "../projects/types.js";

export type AgentRole = "planner" | "worker" | "reviewer" | "supervisor";

export interface ProjectEvent {
  id: string;
  projectId: string;
  type: string;
  taskId?: string;
  payload?: unknown;
  createdAt: Date;
}

export interface StoredReview {
  id: string;
  projectId: string;
  taskId: string;
  attempt: number;
  approved: boolean;
  summary: string;
  issues: unknown;
  createdAt: Date;
}

export interface StoredSupervisorRun {
  id: string;
  projectId: string;
  action: string;
  reason: string;
  instructions?: string;
  createdAt: Date;
}

export interface StoredAgentRun {
  id: string;
  projectId: string;
  taskId?: string;
  role: AgentRole;
  provider: string;
  model?: string;
  status: "success" | "failed";
  error?: string;
  startedAt: Date;
  finishedAt: Date;
}

export interface Storage {
  init(): Promise<void>;
  close(): Promise<void>;

  saveProject(project: Project): Promise<void>;
  getProject(id: string): Promise<Project | undefined>;
  listProjects(): Promise<Project[]>;

  appendEvent(event: ProjectEvent): Promise<void>;
  listEvents(projectId: string): Promise<ProjectEvent[]>;

  saveReview(review: StoredReview): Promise<void>;
  saveSupervisorRun(run: StoredSupervisorRun): Promise<void>;
  saveAgentRun(run: StoredAgentRun): Promise<void>;
}
