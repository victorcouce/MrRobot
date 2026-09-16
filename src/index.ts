import { describeAgent } from "./agents/selector.js";
import { runTask } from "./tasks/runner.js";
import type { Task } from "./tasks/types.js";

const task: Task = {
  id: "TASK-004",
  title: "Implementar persistencia",
  description: "Explica en dos frases cómo guardar tareas en un archivo JSON.",
  status: "ready",
  type: "coding",
  complexity: "low",
};

async function main(): Promise<void> {
  const result = await runTask(task);

  console.log(`\nEstado final: ${result.status}`);

  if (result.executedBy) {
    console.log(`Ejecutado por: ${describeAgent(result.executedBy)}`);
  }

  if (result.output) {
    console.log("Resultado:");
    console.log(result.output);
  }

  if (result.error) {
    console.log("Error:");
    console.log(result.error);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
