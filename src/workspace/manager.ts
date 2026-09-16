import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  IntegrationError,
  IntegrationResult,
  RemoveWorkspaceOptions,
  TaskWorkspace,
  WorkspaceManager,
} from "./types.js";

const MAX_BUFFER = 10 * 1024 * 1024;
const WORKTREES_DIR = ".worktrees";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function runGit(args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      { cwd, maxBuffer: MAX_BUFFER, encoding: "utf8" },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `git ${args.join(" ")} falló: ${stderr.trim() || error.message}`,
            ),
          );
          return;
        }

        resolve(stdout.trim());
      },
    );
  });
}

async function runGitBestEffort(args: string[], cwd?: string): Promise<void> {
  try {
    await runGit(args, cwd);
  } catch {
    // Limpieza best-effort: los errores aquí no deben romper el flujo.
  }
}

export function sanitizeTaskId(taskId: string): string {
  const safe = taskId
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, "-")
    .replace(/^[-.]+/, "")
    .replace(/[-.]+$/, "");

  return safe.length > 0 ? safe : "task";
}

export async function getRepoRoot(cwd?: string): Promise<string> {
  try {
    const inside = await runGit(["rev-parse", "--is-inside-work-tree"], cwd);

    if (inside !== "true") {
      throw new Error("no es un árbol de trabajo");
    }

    const root = await runGit(["rev-parse", "--show-toplevel"], cwd);

    if (!root) {
      throw new Error("raíz vacía");
    }

    return root;
  } catch (error) {
    throw new Error(
      `No se pudo acceder al repositorio Git: ${messageOf(error)}`,
    );
  }
}

export async function resolveBaseRef(cwd?: string): Promise<string> {
  const root = await getRepoRoot(cwd);
  return runGit(["rev-parse", "HEAD"], root);
}

export async function isRepoDirty(cwd?: string): Promise<boolean> {
  const root = await getRepoRoot(cwd);
  const status = await runGit(["status", "--porcelain"], root);
  return status.length > 0;
}

export async function createTaskWorkspace(
  taskId: string,
  attempt: number,
  baseRef: string,
  cwd?: string,
): Promise<TaskWorkspace> {
  const root = await getRepoRoot(cwd);
  const safe = sanitizeTaskId(taskId);
  const branchName = `agent/${safe}-attempt-${attempt}`;
  const path = join(root, WORKTREES_DIR, `${safe}-attempt-${attempt}`);

  if (path === root) {
    throw new Error(
      "Aislamiento inválido: el workspace no puede ser la raíz del repositorio.",
    );
  }

  await mkdir(join(root, WORKTREES_DIR), { recursive: true });

  await runGitBestEffort(["worktree", "remove", "--force", path], root);
  await runGitBestEffort(["branch", "-D", branchName], root);
  await runGitBestEffort(["worktree", "prune"], root);

  try {
    await runGit(["worktree", "add", "-b", branchName, path, baseRef], root);
  } catch (error) {
    throw new Error(
      `No se pudo crear el worktree para ${taskId}: ${messageOf(error)}`,
    );
  }

  return { taskId, branchName, path, baseRef };
}

export async function commitTaskWorkspace(
  workspace: TaskWorkspace,
  message: string,
): Promise<string | undefined> {
  const status = await runGit(["status", "--porcelain"], workspace.path);

  if (status.length === 0) {
    return undefined;
  }

  await runGit(["add", "-A"], workspace.path);
  await runGit(["commit", "-m", message], workspace.path);

  return runGit(["rev-parse", "HEAD"], workspace.path);
}

export async function removeTaskWorkspace(
  workspace: TaskWorkspace,
  options: RemoveWorkspaceOptions = {},
  cwd?: string,
): Promise<void> {
  const root = await getRepoRoot(cwd);

  await runGitBestEffort(["worktree", "remove", "--force", workspace.path], root);
  await runGitBestEffort(["worktree", "prune"], root);

  if (options.deleteBranch) {
    await runGitBestEffort(["branch", "-D", workspace.branchName], root);
  }
}

export async function commitDiff(
  commit: string,
  cwd?: string,
): Promise<string> {
  const root = await getRepoRoot(cwd);
  return runGit(["show", "--patch", "--stat", "--no-color", commit], root);
}

async function conflictFiles(cwd: string): Promise<string[]> {
  try {
    const output = await runGit(
      ["diff", "--name-only", "--diff-filter=U"],
      cwd,
    );
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

async function integrateCommits(
  branchName: string,
  worktreeLabel: string,
  commits: Array<{ taskId: string; commit: string }>,
  baseRef: string,
  cwd?: string,
): Promise<IntegrationResult> {
  const root = await getRepoRoot(cwd);
  const path = join(root, WORKTREES_DIR, worktreeLabel);
  const dependencyTaskIds = commits.map((entry) => entry.taskId);

  await mkdir(join(root, WORKTREES_DIR), { recursive: true });
  await runGitBestEffort(["worktree", "remove", "--force", path], root);
  await runGitBestEffort(["branch", "-D", branchName], root);
  await runGitBestEffort(["worktree", "prune"], root);

  try {
    await runGit(["worktree", "add", "-b", branchName, path, baseRef], root);
  } catch (error) {
    return {
      ok: false,
      error: {
        type: "git_conflict",
        dependencyTaskIds,
        message: `No se pudo crear la integración ${branchName}: ${messageOf(error)}`,
      },
    };
  }

  for (const entry of commits) {
    try {
      await runGit(["cherry-pick", entry.commit], path);
    } catch (error) {
      const files = await conflictFiles(path);

      await runGitBestEffort(["cherry-pick", "--abort"], path);
      await runGitBestEffort(["worktree", "remove", "--force", path], root);
      await runGitBestEffort(["branch", "-D", branchName], root);

      const integrationError: IntegrationError = {
        type: "git_conflict",
        dependencyTaskIds,
        message: `Conflicto al integrar el commit de ${entry.taskId}: ${messageOf(error)}`,
      };

      if (files.length > 0) {
        integrationError.files = files;
      }

      return { ok: false, error: integrationError };
    }
  }

  const ref = await runGit(["rev-parse", "HEAD"], path);

  await runGitBestEffort(["worktree", "remove", "--force", path], root);
  await runGitBestEffort(["worktree", "prune"], root);

  return { ok: true, ref, branchName };
}

export async function integrateDependencies(
  taskId: string,
  dependencyCommits: Array<{ taskId: string; commit: string }>,
  baseRef: string,
  cwd?: string,
): Promise<IntegrationResult> {
  if (dependencyCommits.length === 0) {
    return { ok: true, ref: baseRef, branchName: baseRef };
  }

  const safe = sanitizeTaskId(taskId);
  return integrateCommits(
    `integration/${safe}`,
    `integration-${safe}`,
    dependencyCommits,
    baseRef,
    cwd,
  );
}

export async function finalizeProject(
  projectId: string,
  commits: Array<{ taskId: string; commit: string }>,
  baseRef: string,
  cwd?: string,
): Promise<IntegrationResult> {
  const safe = sanitizeTaskId(projectId);
  return integrateCommits(
    `agent/project-${safe}-final`,
    `project-${safe}-final`,
    commits,
    baseRef,
    cwd,
  );
}

export function createGitWorkspaceManager(cwd?: string): WorkspaceManager {
  return {
    getRepoRoot: () => getRepoRoot(cwd),
    resolveBaseRef: () => resolveBaseRef(cwd),
    isDirty: () => isRepoDirty(cwd),
    create: (taskId, attempt, baseRef) =>
      createTaskWorkspace(taskId, attempt, baseRef, cwd),
    commit: (workspace, message) => commitTaskWorkspace(workspace, message),
    remove: (workspace, options) => removeTaskWorkspace(workspace, options, cwd),
    diff: (commit) => commitDiff(commit, cwd),
    integrateDependencies: (taskId, dependencyCommits, baseRef) =>
      integrateDependencies(taskId, dependencyCommits, baseRef, cwd),
    finalizeProject: (projectId, commits, baseRef) =>
      finalizeProject(projectId, commits, baseRef, cwd),
  };
}

export const gitWorkspaceManager = createGitWorkspaceManager();
