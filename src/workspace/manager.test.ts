import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { AgentCandidate } from "../agents/types.js";
import type { RunOptions } from "../providers/types.js";
import { runTask } from "../tasks/runner.js";
import type { Task } from "../tasks/types.js";
import {
  commitTaskWorkspace,
  createGitWorkspaceManager,
  createTaskWorkspace,
  finalizeProject,
  getRepoRoot,
  integrateDependencies,
  integrateProgress,
  prepareProjectRepo,
  removeTaskWorkspace,
  resolveBaseRef,
  sanitizeTaskId,
  syncWorkingTree,
} from "./manager.js";

function git(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      { cwd, encoding: "utf8" },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message));
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}

async function createTempRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mrrobot-wt-"));

  await git(["init", "-b", "main"], dir);
  await git(["config", "user.email", "test@example.com"], dir);
  await git(["config", "user.name", "Test"], dir);
  await writeFile(join(dir, "README.md"), "# temp\n", "utf8");
  await git(["add", "-A"], dir);
  await git(["commit", "-m", "initial"], dir);

  return dir;
}

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: "T-TEST",
    title: "tarea de prueba",
    description: "descripción de prueba",
    status: "ready",
    type: "coding",
    complexity: "high",
    ...overrides,
  };
}

function cwdOf(options?: RunOptions): string {
  const cwd = options?.cwd;

  if (!cwd) {
    throw new Error("el ejecutor esperaba un cwd aislado");
  }

  return cwd;
}

test("sanitizeTaskId elimina caracteres inválidos para Git", () => {
  assert.equal(sanitizeTaskId("TASK-021"), "TASK-021");
  assert.equal(sanitizeTaskId("task/021 con espacios"), "task-021-con-espacios");
  assert.equal(sanitizeTaskId(".."), "task");
});

test("Caso 1: createTaskWorkspace crea worktree y branch desde HEAD", async () => {
  const repo = await createTempRepo();

  try {
    const base = await resolveBaseRef(repo);
    const workspace = await createTaskWorkspace("TASK-100", 1, base, repo);

    assert.equal(existsSync(workspace.path), true);
    assert.equal(workspace.baseRef, base);
    assert.match(workspace.branchName, /agent\/TASK-100-attempt-1/);

    const worktrees = await git(["worktree", "list", "--porcelain"], repo);
    assert.match(worktrees, /TASK-100-attempt-1/);

    const branches = await git(
      ["branch", "--list", "agent/TASK-100-attempt-1"],
      repo,
    );
    assert.match(branches, /agent\/TASK-100-attempt-1/);

    await removeTaskWorkspace(workspace, { deleteBranch: true }, repo);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("Caso 2: commitTaskWorkspace devuelve SHA y no toca el repo principal", async () => {
  const repo = await createTempRepo();

  try {
    const base = await resolveBaseRef(repo);
    const workspace = await createTaskWorkspace("TASK-101", 1, base, repo);

    await writeFile(join(workspace.path, "nuevo.txt"), "hola\n", "utf8");

    const sha = await commitTaskWorkspace(workspace, "agent(TASK-101): test");

    assert.ok(sha);
    assert.equal(await git(["rev-parse", "HEAD"], workspace.path), sha);
    assert.equal(await git(["rev-parse", "HEAD"], repo), base);

    await removeTaskWorkspace(workspace, { deleteBranch: false }, repo);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("Caso 3: removeTaskWorkspace elimina worktree y branch", async () => {
  const repo = await createTempRepo();

  try {
    const base = await resolveBaseRef(repo);
    const workspace = await createTaskWorkspace("TASK-102", 1, base, repo);

    await removeTaskWorkspace(workspace, { deleteBranch: true }, repo);

    assert.equal(existsSync(workspace.path), false);

    const worktrees = await git(["worktree", "list", "--porcelain"], repo);
    assert.doesNotMatch(worktrees, /TASK-102-attempt-1/);

    const branches = await git(
      ["branch", "--list", "agent/TASK-102-attempt-1"],
      repo,
    );
    assert.equal(branches, "");
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("Caso 4: un intento fallido no modifica el repo principal", async () => {
  const repo = await createTempRepo();

  try {
    const base = await resolveBaseRef(repo);
    const manager = createGitWorkspaceManager(repo);

    const execute = async (
      _prompt: string,
      _agent: AgentCandidate,
      options?: RunOptions,
    ): Promise<string> => {
      await writeFile(join(cwdOf(options), "basura.txt"), "x\n", "utf8");
      throw new Error("boom");
    };

    const result = await runTask(makeTask({ id: "TASK-200" }), {
      execute,
      workspace: manager,
    });

    assert.equal(result.status, "failed");
    assert.equal(await git(["rev-parse", "HEAD"], repo), base);
    assert.equal(await git(["status", "--porcelain"], repo), "");

    const worktrees = await git(["worktree", "list", "--porcelain"], repo);
    assert.doesNotMatch(worktrees, /TASK-200/);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("Caso 5: el fallback parte de un workspace limpio", async () => {
  const repo = await createTempRepo();

  try {
    const manager = createGitWorkspaceManager(repo);

    const execute = async (
      _prompt: string,
      agent: AgentCandidate,
      options?: RunOptions,
    ): Promise<string> => {
      const cwd = cwdOf(options);

      if (agent.provider === "claude" && agent.model === "haiku") {
        await writeFile(join(cwd, "parcial.txt"), "haiku\n", "utf8");
        throw new Error("boom");
      }

      await writeFile(join(cwd, "resultado.txt"), "ok\n", "utf8");
      return "ok";
    };

    const result = await runTask(makeTask({ id: "TASK-201" }), {
      execute,
      workspace: manager,
    });

    assert.equal(result.status, "done");
    assert.equal(result.executedBy?.provider, "deepseek");
    assert.ok(result.resultCommit);
    assert.equal(result.attempts?.length, 2);
    assert.notEqual(
      result.attempts?.[0]?.workspacePath,
      result.attempts?.[1]?.workspacePath,
    );

    const files = await git(
      ["show", "--name-only", "--format=", result.resultCommit ?? "HEAD"],
      repo,
    );
    assert.match(files, /resultado\.txt/);
    assert.doesNotMatch(files, /parcial\.txt/);

    assert.equal(await git(["status", "--porcelain"], repo), "");
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("Caso 6: todos los intentos parten del mismo baseRef", async () => {
  const repo = await createTempRepo();

  try {
    const base = await resolveBaseRef(repo);
    const manager = createGitWorkspaceManager(repo);

    const execute = async (
      _prompt: string,
      agent: AgentCandidate,
      options?: RunOptions,
    ): Promise<string> => {
      if (agent.provider === "claude" && agent.model === "haiku") {
        throw new Error("429 rate limit");
      }

      await writeFile(join(cwdOf(options), "resultado.txt"), "ok\n", "utf8");
      return "ok";
    };

    const result = await runTask(makeTask({ id: "TASK-202" }), {
      execute,
      workspace: manager,
    });

    assert.equal(result.status, "done");
    assert.equal(result.attempts?.length, 2);

    const bases = new Set(result.attempts?.map((attempt) => attempt.baseRef));
    assert.equal(bases.size, 1);
    assert.equal([...bases][0], base);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("propagación: integra los commits de dos dependencias", async () => {
  const repo = await createTempRepo();

  try {
    const base = await resolveBaseRef(repo);

    const a = await createTaskWorkspace("TASK-A", 1, base, repo);
    await writeFile(join(a.path, "a.txt"), "A\n", "utf8");
    const commitA = await commitTaskWorkspace(a, "agent(TASK-A): a");
    await removeTaskWorkspace(a, { deleteBranch: false }, repo);

    const b = await createTaskWorkspace("TASK-B", 1, base, repo);
    await writeFile(join(b.path, "b.txt"), "B\n", "utf8");
    const commitB = await commitTaskWorkspace(b, "agent(TASK-B): b");
    await removeTaskWorkspace(b, { deleteBranch: false }, repo);

    assert.ok(commitA && commitB);

    const integration = await integrateDependencies(
      "TASK-C",
      [
        { taskId: "TASK-A", commit: commitA },
        { taskId: "TASK-B", commit: commitB },
      ],
      base,
      repo,
    );

    assert.equal(integration.ok, true);
    if (integration.ok) {
      assert.equal(await git(["show", `${integration.ref}:a.txt`], repo), "A");
      assert.equal(await git(["show", `${integration.ref}:b.txt`], repo), "B");
    }
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("propagación: conflicto se detecta y no toca el repo principal", async () => {
  const repo = await createTempRepo();

  try {
    const base = await resolveBaseRef(repo);

    const a = await createTaskWorkspace("TASK-A", 1, base, repo);
    await writeFile(join(a.path, "shared.txt"), "A\n", "utf8");
    const commitA = await commitTaskWorkspace(a, "agent(TASK-A): a");
    await removeTaskWorkspace(a, { deleteBranch: false }, repo);

    const b = await createTaskWorkspace("TASK-B", 1, base, repo);
    await writeFile(join(b.path, "shared.txt"), "B\n", "utf8");
    const commitB = await commitTaskWorkspace(b, "agent(TASK-B): b");
    await removeTaskWorkspace(b, { deleteBranch: false }, repo);

    assert.ok(commitA && commitB);

    const integration = await integrateDependencies(
      "TASK-C",
      [
        { taskId: "TASK-A", commit: commitA },
        { taskId: "TASK-B", commit: commitB },
      ],
      base,
      repo,
    );

    assert.equal(integration.ok, false);
    if (!integration.ok) {
      assert.equal(integration.error.type, "git_conflict");
      assert.deepEqual(integration.error.dependencyTaskIds, ["TASK-A", "TASK-B"]);
    }

    assert.equal(await git(["rev-parse", "HEAD"], repo), base);
    assert.equal(await git(["status", "--porcelain"], repo), "");
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("finalizeProject crea una branch aislada con todos los commits", async () => {
  const repo = await createTempRepo();

  try {
    const base = await resolveBaseRef(repo);

    const a = await createTaskWorkspace("TASK-A", 1, base, repo);
    await writeFile(join(a.path, "a.txt"), "A\n", "utf8");
    const commitA = await commitTaskWorkspace(a, "agent(TASK-A): a");
    await removeTaskWorkspace(a, { deleteBranch: false }, repo);

    assert.ok(commitA);

    const result = await finalizeProject(
      "proj-1",
      [{ taskId: "TASK-A", commit: commitA }],
      base,
      repo,
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.branchName, "agent/project-proj-1-final");
      const branches = await git(["branch", "--list", result.branchName], repo);
      assert.match(branches, /agent\/project-proj-1-final/);
      assert.equal(await git(["show", `${result.ref}:a.txt`], repo), "A");
    }

    assert.equal(await git(["rev-parse", "HEAD"], repo), base);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("prepareProjectRepo crea la carpeta, inicializa git y hace commit inicial", async () => {
  const base = await mkdtemp(join(tmpdir(), "mrrobot-prep-"));
  const target = join(base, "nuevo-proyecto");

  try {
    const prepared = await prepareProjectRepo(target);

    assert.equal(prepared.created, true);
    assert.equal(prepared.initialized, true);
    assert.equal(prepared.root, await realpath(target));
    assert.ok(existsSync(join(target, ".git")));

    const head = await git(["rev-parse", "HEAD"], target);
    assert.match(head, /^[0-9a-f]{40}$/);

    const exclude = await git(["rev-parse", "--git-path", "info/exclude"], target);
    const excludePath = exclude.startsWith("/") ? exclude : join(target, exclude);
    const content = await readFile(excludePath, "utf8");
    assert.match(content, /^\.worktrees\/$/m);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("prepareProjectRepo reutiliza un repo existente y configura origin", async () => {
  const repo = await createTempRepo();

  try {
    const base = await resolveBaseRef(repo);
    const prepared = await prepareProjectRepo(repo, "https://github.com/acme/demo.git");

    assert.equal(prepared.created, false);
    assert.equal(prepared.initialized, false);
    assert.equal(prepared.root, await realpath(repo));
    assert.equal(await resolveBaseRef(repo), base);
    assert.equal(
      await git(["remote", "get-url", "origin"], repo),
      "https://github.com/acme/demo.git",
    );
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("getRepoRoot memoriza la raíz pero no cachea un fallo", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mrrobot-root-"));

  try {
    await assert.rejects(() => getRepoRoot(dir), /No se pudo acceder/);

    await git(["init", "-b", "main"], dir);

    const root = await getRepoRoot(dir);
    assert.ok(root);

    // La segunda llamada sale de la caché (mismo valor).
    assert.equal(await getRepoRoot(dir), root);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Caso 7: el fix continúa el intento anterior y aplana en un commit sobre la base", async () => {
  const repo = await createTempRepo();

  try {
    const base = await resolveBaseRef(repo);
    const manager = createGitWorkspaceManager(repo);

    const first = await runTask(makeTask({ id: "TASK-300" }), {
      workspace: manager,
      execute: async (_prompt, _agent, options) => {
        await writeFile(join(cwdOf(options), "a.txt"), "A\n", "utf8");
        return "ok";
      },
    });

    assert.equal(first.status, "done");
    const firstCommit = first.resultCommit;
    assert.ok(firstCommit);

    let sawPreviousWork = false;
    const second = await runTask(makeTask({ id: "TASK-300" }), {
      workspace: manager,
      baseRef: base,
      startRef: firstCommit,
      extraPrompt: "corrige",
      execute: async (_prompt, _agent, options) => {
        sawPreviousWork = existsSync(join(cwdOf(options), "a.txt"));
        await writeFile(join(cwdOf(options), "b.txt"), "B\n", "utf8");
        return "ok";
      },
    });

    assert.equal(second.status, "done");
    const secondCommit = second.resultCommit;
    assert.ok(secondCommit);

    // El agente del fix parte del trabajo anterior.
    assert.equal(sawPreviousWork, true);

    // Un solo commit sobre la base: el padre es `base`, no el primer commit.
    assert.equal(await git(["rev-parse", `${secondCommit}^`], repo), base);

    // El árbol final incluye el trabajo de ambos ciclos.
    const files = await git(["show", "--name-only", "--format=", secondCommit], repo);
    assert.match(files, /a\.txt/);
    assert.match(files, /b\.txt/);

    // El repositorio principal sigue intacto.
    assert.equal(existsSync(join(repo, "a.txt")), false);
    assert.equal(existsSync(join(repo, "b.txt")), false);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});


test("syncWorkingTree deja el resultado en el directorio del repo", async () => {
  const repo = await createTempRepo();

  try {
    const base = await resolveBaseRef(repo);
    const manager = createGitWorkspaceManager(repo);

    const task = await runTask(makeTask({ id: "TASK-SYNC" }), {
      workspace: manager,
      baseRef: base,
      execute: async (_prompt, _agent, options) => {
        await writeFile(join(cwdOf(options), "index.html", ), "<h1>ok</h1>\n", "utf8");
        return "ok";
      },
    });

    const commit = task.resultCommit;
    assert.ok(commit);

    // Antes del volcado el trabajo solo existe dentro de git.
    assert.equal(existsSync(join(repo, "index.html")), false);

    const sync = await syncWorkingTree(commit, "mrrobot: resultado", repo);

    assert.equal(sync.status, "synced");
    assert.equal(sync.branch, "main");
    assert.equal(existsSync(join(repo, "index.html")), true);
    assert.equal(
      await readFile(join(repo, "index.html"), "utf8"),
      "<h1>ok</h1>\n",
    );

    // Avance rápido: la rama del usuario apunta al commit de la tarea.
    assert.equal(await git(["rev-parse", "HEAD"], repo), commit);

    // Repetirlo no cambia nada.
    const again = await syncWorkingTree(commit, "mrrobot: resultado", repo);
    assert.equal(again.status, "unchanged");
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("syncWorkingTree no pisa cambios sin commitear del usuario", async () => {
  const repo = await createTempRepo();

  try {
    const base = await resolveBaseRef(repo);
    const manager = createGitWorkspaceManager(repo);

    const task = await runTask(makeTask({ id: "TASK-DIRTY" }), {
      workspace: manager,
      baseRef: base,
      execute: async (_prompt, _agent, options) => {
        await writeFile(join(cwdOf(options), "a.txt"), "A\n", "utf8");
        return "ok";
      },
    });

    await writeFile(join(repo, "README.md"), "# tocado a mano\n", "utf8");

    const sync = await syncWorkingTree(
      task.resultCommit as string,
      "mrrobot: resultado",
      repo,
    );

    assert.equal(sync.status, "skipped");
    assert.equal(existsSync(join(repo, "a.txt")), false);
    assert.equal(
      await readFile(join(repo, "README.md"), "utf8"),
      "# tocado a mano\n",
    );
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("syncWorkingTree suma una segunda ronda sin perder la primera", async () => {
  const repo = await createTempRepo();

  try {
    const base = await resolveBaseRef(repo);
    const manager = createGitWorkspaceManager(repo);

    const first = await runTask(makeTask({ id: "TASK-R1" }), {
      workspace: manager,
      baseRef: base,
      execute: async (_prompt, _agent, options) => {
        await writeFile(join(cwdOf(options), "uno.txt"), "1\n", "utf8");
        return "ok";
      },
    });

    const firstSync = await syncWorkingTree(
      first.resultCommit as string,
      "mrrobot: ronda 1",
      repo,
    );
    assert.equal(firstSync.status, "synced");

    // Segunda ronda: las tareas siguen partiendo de la base del proyecto, así
    // que la integración no desciende de lo ya volcado.
    const second = await runTask(makeTask({ id: "TASK-R2" }), {
      workspace: manager,
      baseRef: base,
      execute: async (_prompt, _agent, options) => {
        await writeFile(join(cwdOf(options), "dos.txt"), "2\n", "utf8");
        return "ok";
      },
    });

    const integration = await integrateProgress(
      "proyecto",
      [
        { taskId: "TASK-R1", commit: first.resultCommit as string },
        { taskId: "TASK-R2", commit: second.resultCommit as string },
      ],
      base,
      repo,
    );

    assert.equal(integration.ok, true);
    assert.ok(integration.ok);

    const secondSync = await syncWorkingTree(
      integration.ref,
      "mrrobot: ronda 2",
      repo,
    );

    assert.equal(secondSync.status, "synced");
    assert.equal(secondSync.branch, "main");

    // El directorio contiene el trabajo de las dos rondas...
    assert.equal(existsSync(join(repo, "uno.txt")), true);
    assert.equal(existsSync(join(repo, "dos.txt")), true);

    // ...y el volcado anterior sigue en la historia de la rama.
    const history = await git(["log", "--format=%H"], repo);
    assert.ok(history.includes(firstSync.ref as string));
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("los commits de tarea funcionan sin identidad de git configurada", async () => {
  const repo = await mkdtemp(join(tmpdir(), "mrrobot-noident-"));
  const previousGlobal = process.env.GIT_CONFIG_GLOBAL;
  const previousSystem = process.env.GIT_CONFIG_SYSTEM;

  // Una máquina recién estrenada no tiene user.name/user.email: sin identidad
  // propia, `git commit` aborta y la tarea muere sin haber escrito nada.
  process.env.GIT_CONFIG_GLOBAL = "/dev/null";
  process.env.GIT_CONFIG_SYSTEM = "/dev/null";

  try {
    const prepared = await prepareProjectRepo(repo);
    const manager = createGitWorkspaceManager(prepared.root);
    const base = await resolveBaseRef(prepared.root);

    const task = await runTask(makeTask({ id: "TASK-IDENT" }), {
      workspace: manager,
      baseRef: base,
      execute: async (_prompt, _agent, options) => {
        await writeFile(join(cwdOf(options), "a.txt"), "A\n", "utf8");
        return "ok";
      },
    });

    assert.equal(task.status, "done");
    assert.ok(task.resultCommit);

    const sync = await syncWorkingTree(
      task.resultCommit as string,
      "mrrobot: resultado",
      prepared.root,
    );

    assert.equal(sync.status, "synced");
    assert.equal(existsSync(join(prepared.root, "a.txt")), true);
  } finally {
    if (previousGlobal === undefined) {
      delete process.env.GIT_CONFIG_GLOBAL;
    } else {
      process.env.GIT_CONFIG_GLOBAL = previousGlobal;
    }

    if (previousSystem === undefined) {
      delete process.env.GIT_CONFIG_SYSTEM;
    } else {
      process.env.GIT_CONFIG_SYSTEM = previousSystem;
    }

    await rm(repo, { recursive: true, force: true });
  }
});

test("syncWorkingTree convive con archivos sin seguir del usuario", async () => {
  const repo = await createTempRepo();

  try {
    const base = await resolveBaseRef(repo);
    const manager = createGitWorkspaceManager(repo);

    const task = await runTask(makeTask({ id: "TASK-UNTRACKED" }), {
      workspace: manager,
      baseRef: base,
      execute: async (_prompt, _agent, options) => {
        await writeFile(join(cwdOf(options), "a.txt"), "A\n", "utf8");
        return "ok";
      },
    });

    await writeFile(join(repo, "notas.txt"), "mis notas\n", "utf8");

    const sync = await syncWorkingTree(
      task.resultCommit as string,
      "mrrobot: resultado",
      repo,
    );

    assert.equal(sync.status, "synced");
    assert.equal(existsSync(join(repo, "a.txt")), true);
    assert.equal(await readFile(join(repo, "notas.txt"), "utf8"), "mis notas\n");
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});
