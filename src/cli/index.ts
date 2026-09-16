import { mkdir } from "node:fs/promises";
import { loadConfig } from "../config/index.js";
import {
  buildProjectResult,
  createProject,
  pauseProject,
  resumeProject,
  runProject,
  type ProjectDeps,
} from "../projects/service.js";
import type { Project } from "../projects/types.js";
import { createPgliteStorage } from "../storage/pglite.js";

const DATA_DIR = process.env.MRROBOT_DATA_DIR ?? ".mrrobot/data";

function usage(): void {
  console.log(`mrrobot <comando>

Comandos:
  create "<objetivo>"   Crea un proyecto (planner + DAG)
  plan <project-id>     Lista las tareas del plan
  run <project-id>      Ejecuta el proyecto
  status <project-id>   Muestra el estado
  tasks <project-id>    Lista las tareas
  pause <project-id>    Pausa el proyecto
  resume <project-id>   Reanuda el proyecto
`);
}

function requireArg(args: string[], name: string): string {
  const value = args[0];

  if (!value) {
    throw new Error(`falta el argumento <${name}>`);
  }

  return value;
}

function printProject(project: Project): void {
  console.log(`Proyecto ${project.id} (${project.name})`);
  console.log(`Estado: ${project.status}`);
  console.log(`Base: ${project.baseRef}`);

  for (const task of project.tasks) {
    const commit = task.resultCommit ? ` (${task.resultCommit.slice(0, 7)})` : "";
    console.log(`- ${task.id} [${task.status}] ${task.title}${commit}`);
  }

  const result = buildProjectResult(project);

  if (result) {
    console.log(`\nBranch final: ${result.branchName}`);
    console.log(`Commit final: ${result.commitSha}`);
    console.log(`Tareas completadas: ${result.completedTasks}`);
  }
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === "help" || command === "--help") {
    usage();
    return;
  }

  await mkdir(DATA_DIR, { recursive: true });
  const { storage, close } = await createPgliteStorage(DATA_DIR);
  const deps: ProjectDeps = { storage, config: loadConfig() };

  try {
    switch (command) {
      case "create": {
        const goal = args.join(" ").trim();

        if (!goal) {
          throw new Error("falta el objetivo del proyecto");
        }

        const project = await createProject({ goal }, deps);
        console.log(`Proyecto creado: ${project.id}`);
        console.log(`Tareas: ${project.tasks.length}`);
        printProject(project);
        break;
      }

      case "plan":
      case "tasks": {
        const id = requireArg(args, "project-id");
        const project = await storage.getProject(id);

        if (!project) {
          throw new Error(`proyecto ${id} no encontrado`);
        }

        for (const task of project.tasks) {
          console.log(
            `${task.id} [${task.status}] ${task.title}${task.blockedReason ? ` — ${task.blockedReason}` : ""}`,
          );
        }
        break;
      }

      case "run": {
        const id = requireArg(args, "project-id");
        const project = await runProject(id, deps);
        printProject(project);
        break;
      }

      case "status": {
        const id = requireArg(args, "project-id");
        const project = await storage.getProject(id);

        if (!project) {
          throw new Error(`proyecto ${id} no encontrado`);
        }

        printProject(project);
        break;
      }

      case "pause": {
        const project = await pauseProject(requireArg(args, "project-id"), deps);
        console.log(`Proyecto ${project.id} pausado.`);
        break;
      }

      case "resume": {
        const project = await resumeProject(
          requireArg(args, "project-id"),
          deps,
        );
        printProject(project);
        break;
      }

      default:
        usage();
        process.exitCode = 1;
    }
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
