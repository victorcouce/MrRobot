import { execFile } from "node:child_process";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import type {
  IntegrationError,
  IntegrationResult,
  RemoveWorkspaceOptions,
  TaskWorkspace,
  WorkingTreeSync,
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

/**
 * Identidad para los commits que crea el orquestador (commit de tarea, squash,
 * cherry-pick). Si la máquina no tiene `user.name`/`user.email` configurados,
 * `git commit` aborta con "Author identity unknown" y la tarea falla sin haber
 * escrito nada: se usa entonces una identidad propia. Si el usuario tiene la
 * suya, se respeta.
 */
const IDENTITY_FALLBACK = [
  "-c",
  "user.name=MrRobot",
  "-c",
  "user.email=mrrobot@localhost",
];

const identityCache = new Map<string, Promise<string[]>>();

export async function identityArgs(cwd: string): Promise<string[]> {
  const key = resolve(cwd);
  const cached = identityCache.get(key);

  if (cached) {
    return cached;
  }

  const pending = runGit(["var", "GIT_COMMITTER_IDENT"], cwd).then(
    () => [] as string[],
    () => IDENTITY_FALLBACK,
  );

  identityCache.set(key, pending);
  return pending;
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
        ...(await identityArgs(root)),
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
  await runGit(
    [...(await identityArgs(workspace.path)), "commit", "-m", message],
    workspace.path,
  );

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

  await runGit(
    [...(await identityArgs(workspace.path)), "commit", "-m", message],
    workspace.path,
  );

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

  const ident = await identityArgs(path);

  for (const entry of commits) {
    try {
      await runGit([...ident, "cherry-pick", entry.commit], path);
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

export async function integrateProgress(
  projectId: string,
  commits: Array<{ taskId: string; commit: string }>,
  baseRef: string,
  cwd?: string,
): Promise<IntegrationResult> {
  const safe = sanitizeTaskId(projectId);
  return integrateCommits(
    `agent/project-${safe}-progress`,
    `project-${safe}-progress`,
    commits,
    baseRef,
    cwd,
  );
}

async function currentBranch(root: string): Promise<string | undefined> {
  try {
    const branch = await runGit(["symbolic-ref", "--quiet", "--short", "HEAD"], root);
    return branch.length > 0 ? branch : undefined;
  } catch {
    return undefined;
  }
}

async function isAncestor(
  ancestor: string,
  descendant: string,
  root: string,
): Promise<boolean> {
  try {
    await runGit(["merge-base", "--is-ancestor", ancestor, descendant], root);
    return true;
  } catch {
    return false;
  }
}

/**
 * Deja el directorio de trabajo del repo del proyecto en `ref`, que es donde el
 * usuario espera encontrar los archivos y donde miran el planner y el
 * supervisor. Las tareas trabajan en worktrees y sus commits viven en ramas
 * `agent/*`: sin este volcado el directorio del proyecto se queda con `.git` y
 * `.worktrees` y nada más, aunque el plan haya terminado entero.
 *
 * Nunca destruye trabajo del usuario: si hay cambios sin commitear no toca
 * nada, y si la historia ha divergido (ya se volcó una ronda anterior) añade el
 * resultado como un commit nuevo encima en vez de reescribir la rama.
 */
export async function syncWorkingTree(
  ref: string,
  message: string,
  cwd?: string,
): Promise<WorkingTreeSync> {
  try {
    const root = await getRepoRoot(cwd);

    // Solo bloquean los cambios sobre archivos versionados: lo que el usuario
    // haya editado a mano no se pisa. Los archivos sin seguir (node_modules,
    // notas sueltas) conviven con el volcado, y si alguno estorbase de verdad
    // git se niega y el error se reporta tal cual.
    const status = await runGit(
      ["status", "--porcelain", "--untracked-files=no"],
      root,
    );

    if (status.length > 0) {
      return {
        status: "skipped",
        message:
          "El directorio del proyecto tiene cambios sin commitear; no se " +
          "sobrescriben. Commitea o descarta esos cambios para volcar el resultado.",
      };
    }

    const head = await runGit(["rev-parse", "HEAD"], root);
    const target = await runGit(["rev-parse", ref], root);
    const branch = await currentBranch(root);

    if (head === target) {
      return {
        status: "unchanged",
        ref: target,
        ...(branch ? { branch } : {}),
      };
    }

    if (await isAncestor(head, target, root)) {
      await runGit(["merge", "--ff-only", target], root);

      return {
        status: "synced",
        ref: target,
        ...(branch ? { branch } : {}),
      };
    }

    // Historias divergentes: se reescribe el árbol con el resultado y se anota
    // como un commit encima del actual, de modo que nada de lo anterior se
    // pierde y la rama del usuario sigue avanzando en línea recta.
    await runGit(["read-tree", "-m", "-u", target], root);

    const staged = await runGit(
      ["diff", "--cached", "--name-only", "HEAD"],
      root,
    );

    if (staged.length === 0) {
      return {
        status: "unchanged",
        ref: head,
        ...(branch ? { branch } : {}),
      };
    }

    await runGit(
      [...(await identityArgs(root)), "commit", "-m", message],
      root,
    );

    return {
      status: "synced",
      ref: await runGit(["rev-parse", "HEAD"], root),
      ...(branch ? { branch } : {}),
    };
  } catch (error) {
    return { status: "failed", message: messageOf(error) };
  }
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
    integrateProgress: (projectId, commits, baseRef) =>
      integrateProgress(projectId, commits, baseRef, cwd),
    syncWorkingTree: (ref, message) => syncWorkingTree(ref, message, cwd),
  };
}

export const gitWorkspaceManager = createGitWorkspaceManager();
