import { runPlan } from "./scheduler/scheduler.js";
import type { Task } from "./tasks/types.js";

const tasks: Task[] = [
  {
    id: "TASK-001",
    title: "Definir formato de persistencia",
    description: "Explica en dos frases cómo serializar tareas a JSON.",
    status: "todo",
    type: "coding",
    complexity: "low",
  },
  {
    id: "TASK-002",
    title: "Documentar la estrategia",
    description: "Resume en dos frases cómo se cargarían las tareas guardadas.",
    status: "todo",
    type: "coding",
    complexity: "low",
    dependsOn: ["TASK-001"],
  },
];

async function main(): Promise<void> {
  const result = await runPlan(tasks);

  console.log(`\nEstado del plan: ${result.status}`);

  for (const task of result.tasks) {
    console.log(`- ${task.id}: ${task.status}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
