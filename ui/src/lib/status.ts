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
  draft: { label: "Draft", color: "zinc" },
  planning: { label: "Planning", color: "amber", pulse: true },
  ready: { label: "Ready", color: "sky" },
  running: { label: "Running", color: "blue", pulse: true },
  paused: { label: "Paused", color: "amber" },
  blocked: { label: "Blocked", color: "orange" },
  completed: { label: "Completed", color: "emerald" },
  failed: { label: "Failed", color: "red" },
  cancelled: { label: "Cancelled", color: "zinc" },
};

export const TASK_STATUS: Record<TaskStatus, StatusMeta> = {
  todo: { label: "Todo", color: "zinc" },
  ready: { label: "Ready", color: "sky" },
  running: { label: "Running", color: "blue", pulse: true },
  interrupted: { label: "Interrupted", color: "amber" },
  blocked: { label: "Blocked", color: "orange" },
  done: { label: "Done", color: "emerald" },
  failed: { label: "Failed", color: "red" },
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
