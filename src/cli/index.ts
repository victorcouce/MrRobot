import { mkdir } from "node:fs/promises";
import { loadConfig } from "../config/index.js";
import {
  buildProjectResult,
  createProject,
  deleteProject,
  pauseProject,
  resumeProject,
  runProject,
  type CreateProjectInput,
  type ProjectDeps,
} from "../projects/service.js";
import type { Project } from "../projects/types.js";
import {
  importCompletedProject,
  type ImportProjectInput,
} from "../projects/import.js";
import { createPgliteStorage } from "../storage/pglite.js";
import type { Storage } from "../storage/types.js";
import {
  createGitWorkspaceManager,
  prepareProjectRepo,
} from "../workspace/manager.js";

const DATA_DIR = process.env.MRROBOT_DATA_DIR ?? ".mrrobot/data";

function usage(): void {
  console.log(`mrrobot <comando>

Comandos:
  create "<objetivo>" [--folder <ruta>] [--remote <url>]
                        Crea un proyecto (planner + DAG)
  import [--folder <ruta>] [--branch <rama>] [--name <nombre>]
                        Importa un proyecto completado desde una rama final
  plan <project-id>     Lista las tareas del plan
  run <project-id>      Ejecuta el proyecto
  status <project-id>   Muestra el estado
  tasks <project-id>    Lista las tareas
  pause <project-id>    Pausa el proyecto
  resume <project-id>   Reanuda el proyecto
  delete <project-id>   Borra el proyecto de la app (no toca el disco)

Opciones de create:
  --folder <ruta>   Carpeta del proyecto (se crea/inicializa si no existe)
  --remote <url>    Repositorio GitHub a vincular como origin
`);
}

function requireArg(args: string[], name: string): string {
  const value = args[0];

  if (!value) {
    throw new Error(`falta el argumento <${name}>`);
  }

  return value;
}

function parseCreateArgs(args: string[]): CreateProjectInput {
  const positional: string[] = [];
  let repoPath: string | undefined;
  let remoteUrl: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === undefined) {
      continue;
    }

    if (arg === "--folder" || arg === "--repo") {
      repoPath = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--remote") {
      remoteUrl = args[index + 1];
      index += 1;
      continue;
    }

    positional.push(arg);
  }

  const input: CreateProjectInput = { goal: positional.join(" ").trim() };
  if (repoPath) input.repoPath = repoPath;
  if (remoteUrl) input.remoteUrl = remoteUrl;
  return input;
}

function parseImportArgs(args: string[]): ImportProjectInput {
  const options: ImportProjectInput = { repoPath: process.cwd() };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--folder" || arg === "--repo") {
      options.repoPath = args[index + 1] ?? options.repoPath;
      index += 1;
      continue;
    }

    if (arg === "--branch") {
      const branch = args[index + 1];
      if (branch) options.branch = branch;
      index += 1;
      continue;
    }

    if (arg === "--name") {
      const name = args[index + 1];
      if (name) options.name = name;
      index += 1;
      continue;
    }

    if (arg === "--goal") {
      const goal = args[index + 1];
      if (goal) options.goal = goal;
      index += 1;
    }
  }

  return options;
}

function depsForProject(project: Project, storage: Storage): ProjectDeps {
  const deps: ProjectDeps = { storage, config: loadConfig() };

  if (project.repoPath) {
    deps.workspace = createGitWorkspaceManager(project.repoPath);
  }

  return deps;
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
        const input = parseCreateArgs(args);

        if (!input.goal) {
          throw new Error("falta el objetivo del proyecto");
        }

        let createDeps = deps;

        if (input.repoPath) {
          const prepared = await prepareProjectRepo(
            input.repoPath,
            input.remoteUrl,
          );
          createDeps = {
            ...deps,
            workspace: createGitWorkspaceManager(prepared.root),
          };
          input.repoPath = prepared.root;
        }

        const project = await createProject(input, createDeps);
        console.log(`Proyecto creado: ${project.id}`);
        console.log(`Tareas: ${project.tasks.length}`);
        printProject(project);
        break;
      }

      case "import": {
        const project = await importCompletedProject(parseImportArgs(args), {
          storage,
        });
        console.log(`Proyecto importado: ${project.id}`);
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
        const existing = await storage.getProject(id);

        if (!existing) {
          throw new Error(`proyecto ${id} no encontrado`);
        }

        const project = await runProject(id, depsForProject(existing, storage));
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
        const id = requireArg(args, "project-id");
        const existing = await storage.getProject(id);

        if (!existing) {
          throw new Error(`proyecto ${id} no encontrado`);
        }

        const project = await resumeProject(id, depsForProject(existing, storage));
        printProject(project);
        break;
      }

      case "delete": {
        const project = await deleteProject(requireArg(args, "project-id"), deps);
        console.log(
          `Proyecto ${project.id} borrado de la app (el directorio no se ha tocado).`,
        );
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
