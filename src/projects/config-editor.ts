import {
  defaultConfig,
  mergeConfig,
  type OrchestratorConfig,
} from "../config/index.js";
import { emitProjectEvent, type ProjectDeps } from "./service.js";
import type { Project } from "./types.js";

const CONFIG_EDITABLE_STATUSES = new Set(["draft", "ready", "paused"]);

function assertConfigEditable(project: Project): void {
  if (!CONFIG_EDITABLE_STATUSES.has(project.status)) {
    throw new Error(
      `No se puede editar la configuración en estado ${project.status}. Solo antes de ejecutar o en pausa (draft, ready o paused).`,
    );
  }
}

export async function updateProjectConfig(
  projectId: string,
  overrides: Partial<OrchestratorConfig>,
  deps: ProjectDeps,
): Promise<Project> {
  const project = await deps.storage.getProject(projectId);

  if (!project) {
    throw new Error(`Proyecto ${projectId} no encontrado.`);
  }

  assertConfigEditable(project);

  const base = project.config ?? deps.config ?? defaultConfig;
  const config = mergeConfig(base, overrides);

  const updated: Project = {
    ...project,
    config,
    updatedAt: new Date(),
  };

  await deps.storage.saveProject(updated);
  await emitProjectEvent(deps.storage, projectId, "project.config_updated");

  return updated;
}
