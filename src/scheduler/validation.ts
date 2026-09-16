import type { Task } from "../tasks/types.js";

export function findDuplicateIds(tasks: Task[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const task of tasks) {
    if (seen.has(task.id)) {
      duplicates.add(task.id);
    }
    seen.add(task.id);
  }

  return [...duplicates];
}

export function findMissingDependencies(tasks: Task[]): string[] {
  const ids = new Set(tasks.map((task) => task.id));
  const problems: string[] = [];

  for (const task of tasks) {
    for (const dependency of task.dependsOn ?? []) {
      if (!ids.has(dependency)) {
        problems.push(`${task.id} depende de ${dependency}, que no existe`);
      }
    }
  }

  return problems;
}

export function findCycle(tasks: Task[]): string[] | undefined {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];

  function visit(id: string): string[] | undefined {
    const current = state.get(id);

    if (current === "done") {
      return undefined;
    }

    if (current === "visiting") {
      const start = stack.indexOf(id);
      return [...stack.slice(start), id];
    }

    state.set(id, "visiting");
    stack.push(id);

    const task = byId.get(id);

    for (const dependency of task?.dependsOn ?? []) {
      const cycle = visit(dependency);

      if (cycle) {
        return cycle;
      }
    }

    stack.pop();
    state.set(id, "done");

    return undefined;
  }

  for (const task of tasks) {
    const cycle = visit(task.id);

    if (cycle) {
      return cycle;
    }
  }

  return undefined;
}

export function validatePlan(tasks: Task[]): void {
  const duplicates = findDuplicateIds(tasks);

  if (duplicates.length > 0) {
    throw new Error(
      `El plan contiene IDs duplicados: ${duplicates.join(", ")}.`,
    );
  }

  const missing = findMissingDependencies(tasks);

  if (missing.length > 0) {
    throw new Error(
      `El plan tiene dependencias inexistentes: ${missing.join("; ")}.`,
    );
  }

  const cycle = findCycle(tasks);

  if (cycle) {
    throw new Error(
      `El plan contiene una dependencia circular: ${cycle.join(" → ")}.`,
    );
  }
}
