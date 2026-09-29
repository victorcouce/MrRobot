import type { Task } from "./types";

/** Número de niveles del DAG de tareas (0 si no hay dependencias). */
export function countLevels(tasks: Task[]): number {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const memo = new Map<string, number>();

  const level = (id: string): number => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    const task = byId.get(id);
    if (!task || !task.dependsOn || task.dependsOn.length === 0) {
      memo.set(id, 0);
      return 0;
    }
    let max = 0;
    for (const dep of task.dependsOn) max = Math.max(max, level(dep) + 1);
    memo.set(id, max);
    return max;
  };

  if (tasks.length === 0) return 0;
  let levels = 0;
  for (const task of tasks) levels = Math.max(levels, level(task.id) + 1);
  return levels;
}
