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
}
