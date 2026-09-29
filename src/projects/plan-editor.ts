import type { AgentSpec } from "../agents/types.js";
import { validatePlan } from "../scheduler/validation.js";
import type { Task, TaskComplexity, TaskType } from "../tasks/types.js";
import type { Project } from "./types.js";
import { emitProjectEvent, type ProjectDeps } from "./service.js";

const EDITABLE_STATUSES = new Set([
  "draft",
  "ready",
  // El plan también se puede corregir cuando no está ejecutándose: p. ej.
  // añadir una dependencia a una tarea que arrancó en un worktree vacío.
  "paused",
  "blocked",
  "failed",
]);

export interface NewTaskInput {
  id?: string;
  title: string;
  description: string;
  type: TaskType;
  complexity: TaskComplexity;
  dependsOn?: string[];
  acceptanceCriteria?: string[];
  agent?: AgentSpec;
}

export interface TaskPatch {
  title?: string;
  description?: string;
  type?: TaskType;
  complexity?: TaskComplexity;
  dependsOn?: string[];
  acceptanceCriteria?: string[];
  agent?: AgentSpec | null;
}

function assertEditable(project: Project): void {
  if (!EDITABLE_STATUSES.has(project.status)) {
    throw new Error(
      `El plan no es editable en estado ${project.status}. Solo se puede editar antes de ejecutar (draft o ready) o con la ejecución detenida (paused, blocked o failed).`,
    );
  }
}

function nextTaskId(tasks: Array<{ id: string }>): string {
  let max = 0;

  for (const task of tasks) {
    const match = /^TASK-(\d+)$/.exec(task.id);
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }

  return `TASK-${String(max + 1).padStart(3, "0")}`;
}

async function saveAndEmit(
  deps: ProjectDeps,
  project: Project,
  event: string,
  taskId?: string,
  payload?: unknown,
): Promise<Project> {
  await deps.storage.saveProject(project);
  await emitProjectEvent(deps.storage, project.id, event, taskId, payload);
  return project;
}

export async function addTaskToPlan(
  projectId: string,
  input: NewTaskInput,
  deps: ProjectDeps,
): Promise<Project> {
  const project = await deps.storage.getProject(projectId);

  if (!project) {
    throw new Error(`Proyecto ${projectId} no encontrado.`);
  }

  assertEditable(project);

  const task: Task = {
    id: input.id ?? nextTaskId(project.tasks),
    title: input.title,
    description: input.description,
    status: "todo",
    type: input.type,
    complexity: input.complexity,
    dependsOn: input.dependsOn ?? [],
    acceptanceCriteria: input.acceptanceCriteria ?? [],
  };

  if (input.agent) task.agent = input.agent;

  const tasks = [...project.tasks, task];
  validatePlan(tasks);

  const updated: Project = { ...project, tasks, updatedAt: new Date() };
  return saveAndEmit(deps, updated, "plan.updated", task.id, { action: "add" });
}

export async function updateTaskInPlan(
  projectId: string,
  taskId: string,
  patch: TaskPatch,
  deps: ProjectDeps,
): Promise<Project> {
  const project = await deps.storage.getProject(projectId);

  if (!project) {
    throw new Error(`Proyecto ${projectId} no encontrado.`);
  }

  assertEditable(project);

  const index = project.tasks.findIndex((task) => task.id === taskId);

  if (index === -1) {
    throw new Error(`Tarea ${taskId} no encontrada.`);
  }

  const existing = project.tasks[index];
  if (!existing) {
    throw new Error(`Tarea ${taskId} no encontrada.`);
  }

  const updated = { ...existing };

  if (patch.title !== undefined) updated.title = patch.title;
  if (patch.description !== undefined) updated.description = patch.description;
  if (patch.type !== undefined) updated.type = patch.type;
  if (patch.complexity !== undefined) updated.complexity = patch.complexity;
  if (patch.dependsOn !== undefined) updated.dependsOn = patch.dependsOn;
  if (patch.acceptanceCriteria !== undefined) {
    updated.acceptanceCriteria = patch.acceptanceCriteria;
  }

  if (patch.agent !== undefined) {
    if (patch.agent === null) {
      delete updated.agent;
    } else {
      updated.agent = patch.agent;
    }
  }

  const tasks = project.tasks.map((task, i) => (i === index ? updated : task));
  validatePlan(tasks);

  const saved: Project = { ...project, tasks, updatedAt: new Date() };
  return saveAndEmit(deps, saved, "plan.updated", taskId, { action: "update" });
}

export async function removeTaskFromPlan(
  projectId: string,
  taskId: string,
  deps: ProjectDeps,
): Promise<Project> {
  const project = await deps.storage.getProject(projectId);

  if (!project) {
    throw new Error(`Proyecto ${projectId} no encontrado.`);
  }

  assertEditable(project);

  if (!project.tasks.some((task) => task.id === taskId)) {
    throw new Error(`Tarea ${taskId} no encontrada.`);
  }

  const tasks = project.tasks
    .filter((task) => task.id !== taskId)
    .map((task) => ({
      ...task,
      dependsOn: (task.dependsOn ?? []).filter((id) => id !== taskId),
    }));

  validatePlan(tasks);

  const updated: Project = { ...project, tasks, updatedAt: new Date() };
  return saveAndEmit(deps, updated, "plan.updated", taskId, { action: "remove" });
}
