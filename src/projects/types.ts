import type { AgentSpec, Attachment } from "../agents/types.js";
import type { OrchestratorConfig } from "../config/types.js";
import type { Task } from "../tasks/types.js";

/** Ronda de la entrevista de afinado: lo que preguntó el planner y lo que respondió el usuario. */
export interface ProjectBriefRound {
  message: string;
  answer: string;
}

/**
 * Entrevista de afinado que precedió al plan. Se guarda para que el hilo del
 * proyecto conserve la conversación inicial una vez planificado o terminado.
 */
export interface ProjectBrief {
  rounds: ProjectBriefRound[];
  summary: string;
}

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

  /** Nombre que el usuario le pone en la barra lateral; si falta se usa el objetivo. */
  title?: string;
  pinned?: boolean;
  archivedAt?: Date;

  status: ProjectStatus;

  baseRef: string;

  repoPath?: string;
  remoteUrl?: string;

  /** Icono elegido por el usuario (nombre de icono de la UI). */
  icon?: string;

  tasks: Task[];

  config?: OrchestratorConfig;

  /** Agentes que heredan los chats nuevos del proyecto. */
  defaultAllowedAgents?: AgentSpec[];

  /** Entrevista de afinado con la que se generó el plan inicial. */
  brief?: ProjectBrief;

  /** Archivos adjuntos al objetivo al crear el proyecto. */
  attachments?: Attachment[];

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
