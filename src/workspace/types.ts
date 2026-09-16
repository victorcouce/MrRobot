export interface TaskWorkspace {
  taskId: string;
  branchName: string;
  path: string;
  baseRef: string;
}

export interface RemoveWorkspaceOptions {
  deleteBranch?: boolean;
}

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
}
