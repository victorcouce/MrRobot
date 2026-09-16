import type { Task, TaskStatus } from "../tasks/types.js";

const PRESERVED_STATUSES: TaskStatus[] = ["done", "failed", "running"];

export function dependenciesOf(task: Task): string[] {
  return task.dependsOn ?? [];
}

export function areDependenciesSatisfied(task: Task, tasks: Task[]): boolean {
  const dependencies = dependenciesOf(task);

  if (dependencies.length === 0) {
    return true;
  }

  const statusById = new Map(
    tasks.map((candidate) => [candidate.id, candidate.status]),
  );

  return dependencies.every((dependency) => statusById.get(dependency) === "done");
}

function withStatus(
  task: Task,
  status: TaskStatus,
  blockedReason?: string,
): Task {
  const { blockedReason: _previous, ...rest } = task;

  if (status === "blocked" && blockedReason !== undefined) {
    return { ...rest, status, blockedReason };
  }

  return { ...rest, status };
}

export function updateTaskStatuses(tasks: Task[]): Task[] {
  const statusById = new Map(tasks.map((task) => [task.id, task.status]));

  return tasks.map((task) => {
    if (PRESERVED_STATUSES.includes(task.status)) {
      return task;
    }

    if (task.status === "blocked" && task.integrationError) {
      return task;
    }

    const dependencies = dependenciesOf(task);

    if (dependencies.length === 0) {
      return withStatus(task, "ready");
    }

    const failedDependencies = dependencies.filter(
      (dependency) => statusById.get(dependency) === "failed",
    );

    if (failedDependencies.length > 0) {
      return withStatus(
        task,
        "blocked",
        `bloqueada por ${failedDependencies.join(", ")} (failed)`,
      );
    }

    if (areDependenciesSatisfied(task, tasks)) {
      return withStatus(task, "ready");
    }

    const pendingDependencies = dependencies.filter(
      (dependency) => statusById.get(dependency) !== "done",
    );

    return withStatus(
      task,
      "blocked",
      `esperando a ${pendingDependencies.join(", ")}`,
    );
  });
}

export function getReadyTasks(tasks: Task[]): Task[] {
  return tasks.filter((task) => task.status === "ready");
}
