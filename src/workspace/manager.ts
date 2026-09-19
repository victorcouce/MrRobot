import { execFile } from "node:child_process";
import { access, appendFile, mkdir, readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
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
      {
        cwd,
        maxBuffer: MAX_BUFFER,
        encoding: "utf8",
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      },
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

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Las operaciones sobre la lista de worktrees comparten estado en `.git`:
 * `worktree prune` recorre y borra entradas mientras otro `worktree add` puede
 * estar creando la suya. Con varias tareas en paralelo esa carrera hace fallar
 * el `add`, y un fallo ahí cuesta rehacer la tarea entera. Se serializan: son
 * milisegundos, frente a los minutos que cuesta un reintento.
 */
let worktreeQueue: Promise<unknown> = Promise.resolve();

function withWorktreeLock<T>(operation: () => Promise<T>): Promise<T> {
  const next = worktreeQueue.then(operation, operation);
  worktreeQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export function sanitizeTaskId(taskId: string): string {
  const safe = taskId
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, "-")
    .replace(/^[-.]+/, "")
    .replace(/[-.]+$/, "");

  return safe.length > 0 ? safe : "task";
}

async function readRepoRoot(cwd?: string): Promise<string> {
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

/**
 * Raíz del repo para `cwd`, memorizada por ruta. Es estable durante el proceso
 * y se consulta muchas veces por tarea e intento (aislamiento, dirty, commits).
 * Un fallo no se cachea, para no bloquear un repo que aún no existe.
 */
const repoRootCache = new Map<string, Promise<string>>();

export function getRepoRoot(cwd?: string): Promise<string> {
  const key = resolve(cwd ?? process.cwd());
  const cached = repoRootCache.get(key);

  if (cached) {
    return cached;
  }

  const pending = readRepoRoot(cwd).catch((error) => {
    repoRootCache.delete(key);
    throw error;
  });

  repoRootCache.set(key, pending);
  return pending;
}

export async function resolveBaseRef(cwd?: string): Promise<string> {
  const root = await getRepoRoot(cwd);
  return runGit(["rev-parse", "HEAD"], root);
}

async function isInsideWorkTree(cwd: string): Promise<boolean> {
  try {
    return (await runGit(["rev-parse", "--is-inside-work-tree"], cwd)) === "true";
  } catch {
    return false;
  }
}

async function hasHead(cwd: string): Promise<boolean> {
  try {
    await runGit(["rev-parse", "--verify", "HEAD"], cwd);
    return true;
  } catch {
    return false;
  }
}

async function setOrigin(root: string, url: string): Promise<void> {
  try {
    await runGit(["remote", "get-url", "origin"], root);
    await runGit(["remote", "set-url", "origin", url], root);
  } catch {
    await runGit(["remote", "add", "origin", url], root);
  }
}

function isGithubHttps(url: string): boolean {
  return /^https:\/\/github\.com\//i.test(url);
}

function githubAuthArgs(): string[] {
  if (!process.env.GITHUB_TOKEN) {
    return [];
  }

  return [
    "-c",
    "credential.helper=",
    "-c",
    'credential.helper=!f() { echo username=x-access-token; echo password="$GITHUB_TOKEN"; }; f',
  ];
}

export async function verifyRemote(url: string, cwd?: string): Promise<void> {
  if (!process.env.GITHUB_TOKEN || !isGithubHttps(url)) {
    return;
  }

  try {
    await runGit([...githubAuthArgs(), "ls-remote", "--exit-code", url], cwd);
  } catch (error) {
    throw new Error(
      `No se pudo acceder al remoto ${url} con GITHUB_TOKEN: ${messageOf(error)}`,
    );
  }
}

export async function pushBranch(
  branchName: string,
  cwd?: string,
): Promise<void> {
  await runGit(
    [...githubAuthArgs(), "push", "--set-upstream", "origin", branchName],
    cwd,
  );
}

async function excludeWorktreesDir(root: string): Promise<void> {
  const gitPath = await runGit(
    ["rev-parse", "--git-path", "info/exclude"],
    root,
  );
  const excludePath = isAbsolute(gitPath) ? gitPath : join(root, gitPath);

  try {
    const content = await readFile(excludePath, "utf8");
    if (content.split("\n").some((line) => line.trim() === `${WORKTREES_DIR}/`)) {
      return;
    }
  } catch {
    // El archivo puede no existir todavía; se crea al escribir.
  }

  await appendFile(excludePath, `\n${WORKTREES_DIR}/\n`, "utf8");
}

export interface PreparedRepo {
  root: string;
  created: boolean;
  initialized: boolean;
}

export async function prepareProjectRepo(
  repoPath: string,
  remoteUrl?: string,
): Promise<PreparedRepo> {
  const target = resolve(repoPath);
  await mkdir(target, { recursive: true });

  const existed = await isInsideWorkTree(target);

  if (!existed) {
    await runGit(["init"], target);
  }

  const root = await getRepoRoot(target);
  let initialized = false;

  if (!(await hasHead(root))) {
    await runGit(
      [
        "-c",
        "user.name=MrRobot",
        "-c",
        "user.email=mrrobot@localhost",
        "commit",
        "--allow-empty",
        "-m",
        "chore: initial commit",
      ],
      root,
    );
    initialized = true;
  }

  if (remoteUrl) {
    await setOrigin(root, remoteUrl);
    await verifyRemote(remoteUrl, root);
  }

  await excludeWorktreesDir(root);

  return { root, created: !existed, initialized };
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

  return withWorktreeLock(async () => {
    // El caso normal es que el worktree no exista: entonces basta con borrar la
    // rama que pudiera quedar de una ejecución anterior, sin pagar el `remove`
    // ni el `prune` (que además recorren toda la lista de worktrees).
    if (await pathExists(path)) {
      await runGitBestEffort(["worktree", "remove", "--force", path], root);
      await runGitBestEffort(["worktree", "prune"], root);
    }

    await runGitBestEffort(["branch", "-D", branchName], root);

    try {
      await runGit(["worktree", "add", "-b", branchName, path, baseRef], root);
    } catch (error) {
      throw new Error(
        `No se pudo crear el worktree para ${taskId}: ${messageOf(error)}`,
      );
    }

    return { taskId, branchName, path, baseRef };
  });
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

export async function squashTaskWorkspace(
  workspace: TaskWorkspace,
  ontoRef: string,
  message: string,
): Promise<string> {
  await runGit(["reset", "--soft", ontoRef], workspace.path);

  // Si el fix revirtió todo, el árbol coincide con `ontoRef`: no hay commit.
  const staged = await runGit(
    ["diff", "--cached", "--name-only"],
    workspace.path,
  );

  if (staged.length === 0) {
    return ontoRef;
  }

  await runGit(["commit", "-m", message], workspace.path);

  return runGit(["rev-parse", "HEAD"], workspace.path);
}

export async function removeTaskWorkspace(
  workspace: TaskWorkspace,
  options: RemoveWorkspaceOptions = {},
  cwd?: string,
): Promise<void> {
  const root = await getRepoRoot(cwd);

  await withWorktreeLock(async () => {
    await runGitBestEffort(
      ["worktree", "remove", "--force", workspace.path],
      root,
    );
    await runGitBestEffort(["worktree", "prune"], root);

    if (options.deleteBranch) {
      await runGitBestEffort(["branch", "-D", workspace.branchName], root);
    }
  });
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

  const created = await withWorktreeLock(async () => {
    if (await pathExists(path)) {
      await runGitBestEffort(["worktree", "remove", "--force", path], root);
      await runGitBestEffort(["worktree", "prune"], root);
    }

    await runGitBestEffort(["branch", "-D", branchName], root);

    try {
      await runGit(["worktree", "add", "-b", branchName, path, baseRef], root);
      return undefined;
    } catch (error) {
      return messageOf(error);
    }
  });

  if (created !== undefined) {
    return {
      ok: false,
      error: {
        type: "git_conflict",
        dependencyTaskIds,
        message: `No se pudo crear la integración ${branchName}: ${created}`,
      },
    };
  }

  for (const entry of commits) {
    try {
      await runGit(["cherry-pick", entry.commit], path);
    } catch (error) {
      const files = await conflictFiles(path);

      await runGitBestEffort(["cherry-pick", "--abort"], path);
      await withWorktreeLock(async () => {
        await runGitBestEffort(["worktree", "remove", "--force", path], root);
        await runGitBestEffort(["branch", "-D", branchName], root);
      });

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

  await withWorktreeLock(async () => {
    await runGitBestEffort(["worktree", "remove", "--force", path], root);
    await runGitBestEffort(["worktree", "prune"], root);
  });

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
    squash: (workspace, ontoRef, message) =>
      squashTaskWorkspace(workspace, ontoRef, message),
    remove: (workspace, options) => removeTaskWorkspace(workspace, options, cwd),
    diff: (commit) => commitDiff(commit, cwd),
    push: (branchName) => pushBranch(branchName, cwd),
    integrateDependencies: (taskId, dependencyCommits, baseRef) =>
      integrateDependencies(taskId, dependencyCommits, baseRef, cwd),
    finalizeProject: (projectId, commits, baseRef) =>
      finalizeProject(projectId, commits, baseRef, cwd),
  };
}

export const gitWorkspaceManager = createGitWorkspaceManager();
