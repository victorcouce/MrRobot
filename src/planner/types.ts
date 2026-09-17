import type { Attachment } from "../agents/types.js";
import type { TaskComplexity, TaskType } from "../tasks/types.js";

export interface GeneratedTask {
  id: string;
  title: string;
  description: string;
  type: TaskType;
  complexity: TaskComplexity;
  dependsOn: string[];
  acceptanceCriteria: string[];
  /** Referencias a adjuntos del contexto (`ADJ-1`, `ADJ-2`…). */
  attachments: string[];
}

export interface GeneratedPlan {
  summary: string;
  tasks: GeneratedTask[];
}

export interface PlanContext {
  previousPlan?: GeneratedPlan;
  completedTaskIds?: string[];
  failedTaskIds?: string[];
  supervisorReason?: string;
  instructions?: string;
  conversation?: Array<{ role: string; content: string }>;
  /** Adjuntos del chat, disponibles para que las tareas los referencien. */
  attachments?: Attachment[];
}
