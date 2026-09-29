export interface TaskWorkspace {
  taskId: string;
  branchName: string;
  path: string;
  baseRef: string;
}

export interface RemoveWorkspaceOptions {
  deleteBranch?: boolean;
}

export type IntegrationErrorType = "git_conflict";

export interface IntegrationError {
  type: IntegrationErrorType;
  dependencyTaskIds: string[];
  files?: string[];
  message: string;
}

export type WorkingTreeSyncStatus =
  /** El directorio de trabajo pasó a contener el resultado. */
  | "synced"
  /** Ya lo contenía: no había nada que volcar. */
  | "unchanged"
  /** Había cambios sin commitear: no se toca nada del usuario. */
  | "skipped"
  /** Git falló al volcarlo; el resultado sigue en su rama. */
  | "failed";

export interface WorkingTreeSync {
  status: WorkingTreeSyncStatus;
  /** Commit en el que quedó el directorio de trabajo. */
  ref?: string;
  /** Rama actualizada, si el repo no estaba en HEAD separado. */
  branch?: string;
  message?: string;
}

export type IntegrationResult =
  | { ok: true; ref: string; branchName: string }
  | { ok: false; error: IntegrationError };

export interface WorkspaceManager {
  getRepoRoot(): Promise<string>;
  resolveBaseRef(): Promise<string>;
  isDirty(): Promise<boolean>;
  create(
    taskId: string,
    attempt: number,
    baseRef: string,
  ): Promise<TaskWorkspace>;
  commit(workspace: TaskWorkspace, message: string): Promise<string | undefined>;
  /**
   * Reaplica el árbol actual del worktree como un único commit sobre `ontoRef`,
   * descartando los commits intermedios. Se usa en los ciclos de review/fix:
   * el agente continúa desde el intento anterior, pero la tarea queda con un
   * solo commit sobre su base de integración (para que el cherry-pick funcione).
   */
  squash(
    workspace: TaskWorkspace,
    ontoRef: string,
    message: string,
  ): Promise<string>;
  remove(
    workspace: TaskWorkspace,
    options?: RemoveWorkspaceOptions,
  ): Promise<void>;

  diff(commit: string): Promise<string>;

  push?(branchName: string): Promise<void>;

  integrateDependencies(
    taskId: string,
    dependencyCommits: Array<{ taskId: string; commit: string }>,
    baseRef: string,
  ): Promise<IntegrationResult>;

  finalizeProject(
    projectId: string,
    commits: Array<{ taskId: string; commit: string }>,
    baseRef: string,
  ): Promise<IntegrationResult>;

  /**
   * Integra el trabajo completado hasta ahora en una rama de progreso, sin
   * tocar la rama final del proyecto. Sirve para volcar resultados parciales
   * entre rondas.
   */
  integrateProgress?(
    projectId: string,
    commits: Array<{ taskId: string; commit: string }>,
    baseRef: string,
  ): Promise<IntegrationResult>;

  /**
   * Deja el directorio de trabajo del repo en `ref`. Sin esto el resultado solo
   * existe dentro de ramas de git: el usuario no ve ningún archivo y los roles
   * que inspeccionan ese directorio (planner, supervisor) lo ven vacío.
   */
  syncWorkingTree?(ref: string, message: string): Promise<WorkingTreeSync>;
}
