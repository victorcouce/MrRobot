import type { ProjectStatus, TaskStatus } from "./types";

export type StatusColor =
  | "zinc"
  | "amber"
  | "sky"
  | "blue"
  | "orange"
  | "emerald"
  | "red";

export interface StatusMeta {
  label: string;
  color: StatusColor;
  pulse?: boolean;
}

export const PROJECT_STATUS: Record<ProjectStatus, StatusMeta> = {
  draft: { label: "Borrador", color: "zinc" },
  planning: { label: "Planificando", color: "amber", pulse: true },
  ready: { label: "Listo", color: "sky" },
  running: { label: "Ejecutando", color: "blue", pulse: true },
  paused: { label: "En pausa", color: "amber" },
  blocked: { label: "Bloqueado", color: "orange" },
  completed: { label: "Completado", color: "emerald" },
  failed: { label: "Fallido", color: "red" },
  cancelled: { label: "Cancelado", color: "zinc" },
};

export const TASK_STATUS: Record<TaskStatus, StatusMeta> = {
  todo: { label: "Pendiente", color: "zinc" },
  ready: { label: "Lista", color: "sky" },
  running: { label: "En curso", color: "blue", pulse: true },
  interrupted: { label: "Interrumpida", color: "amber" },
  blocked: { label: "Bloqueada", color: "orange" },
  done: { label: "Hecha", color: "emerald" },
  failed: { label: "Fallida", color: "red" },
};

export const TASK_TYPE_LABELS: Record<string, string> = {
  planning: "Planning",
  architecture: "Architecture",
  coding: "Coding",
  review: "Review",
  testing: "Testing",
  research: "Research",
};

export const COMPLEXITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};
