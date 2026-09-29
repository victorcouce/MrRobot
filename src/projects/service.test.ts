import assert from "node:assert/strict";
import { describeAgent } from "../agents/selector.js";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CheckResult } from "../checks/types.js";
import { defaultConfig } from "../config/index.js";
import { InMemoryStorage } from "../storage/memory.js";
import type { Task } from "../tasks/types.js";
import type { WorkspaceManager } from "../workspace/types.js";
import {
  buildProjectResult,
  createProject,
  createProjectDraft,
  gatherRepoContext,
  generatePlan,
  mergeReplan,
  recoverInterrupted,
  recoverInterruptedProjects,
  renderWorkspaceMap,
  repeatedFailures,
  requeueFailedTasks,
  resumeProject,
  runProject,
  shouldSkipReview,
  wantsDevSmoke,
  type ProjectDeps,
} from "./service.js";
import type { Project } from "./types.js";

const planA = {
  summary: "plan A",
  tasks: [
    {
      id: "TASK-001",
      title: "base",
      description: "base",
      type: "coding",
      complexity: "low",
      dependsOn: [],
      acceptanceCriteria: [],
    },
    {
      id: "TASK-002",
      title: "ui",
      description: "ui",
      type: "coding",
      complexity: "low",
      dependsOn: ["TASK-001"],
      acceptanceCriteria: [],
    },
  ],
};

const planWithExtra = {
  summary: "plan B",
  tasks: [
    ...planA.tasks,
    {
      id: "TASK-003",
      title: "extra",
      description: "extra",
      type: "coding",
      complexity: "low",
      dependsOn: [],
      acceptanceCriteria: [],
    },
  ],
};

const singleTaskPlan = {
  summary: "plan único",
  tasks: [
    {
      id: "TASK-001",
      title: "única",
      description: "única",
      type: "coding",
      complexity: "low",
      dependsOn: [],
      acceptanceCriteria: [],
    },
  ],
};

function fakeWorkspace(
  conflictOn?: string,
  synced: string[] = [],
  progressCommits: string[][] = [],
): WorkspaceManager {
  let commits = 0;
  let workspaces = 0;

  return {
    getRepoRoot: async () => "/fake/repo",
    resolveBaseRef: async () => "base0",
    isDirty: async () => false,
    create: async (taskId, attempt, baseRef) => {
      workspaces += 1;
      return {
        taskId,
        branchName: `agent/${taskId}-attempt-${attempt}`,
        path: `/fake/repo/.worktrees/${taskId}-${workspaces}`,
        baseRef,
      };
    },
    commit: async () => {
      commits += 1;
      return `commit-${commits}`;
    },
    squash: async () => {
      commits += 1;
      return `commit-${commits}`;
    },
    remove: async () => {},
    diff: async () => "",
    integrateDependencies: async (taskId, dependencyCommits, baseRef) => {
      if (conflictOn === taskId) {
        return {
          ok: false,
          error: {
            type: "git_conflict",
            dependencyTaskIds: dependencyCommits.map((entry) => entry.taskId),
            files: ["x.ts"],
            message: "conflicto",
          },
        };
      }
      return { ok: true, ref: baseRef, branchName: `integration/${taskId}` };
    },
    finalizeProject: async () => ({
      ok: true,
      ref: "final-commit",
      branchName: "agent/project-final",
    }),
    integrateProgress: async (_projectId, commits) => {
      progressCommits.push(commits.map((entry) => entry.taskId));
      return {
        ok: true,
        ref: "progress-commit",
        branchName: "agent/project-progress",
      };
    },
    syncWorkingTree: async (ref) => {
      synced.push(ref);
      return { status: "synced", ref, branch: "main" };
    },
  };
}

function baseDeps(
  storage: InMemoryStorage,
  workspace: WorkspaceManager,
): ProjectDeps {
  return {
    storage,
    workspace,
    plannerExecute: async () => JSON.stringify(planA),
    workerExecute: async () => "ok",
    reviewerExecute: async () =>
      JSON.stringify({ approved: true, summary: "ok", issues: [] }),
    supervisorExecute: async () =>
      JSON.stringify({ action: "continue", reason: "ok" }),
  };
}

test("E2E mock: proyecto completado con branch final aislada", async () => {
  const storage = new InMemoryStorage();
  await storage.init();
  const deps = baseDeps(storage, fakeWorkspace());

  const project = await createProject({ goal: "crear librería" }, deps);
  assert.equal(project.status, "ready");
  assert.equal(project.tasks.length, 2);

  const finished = await runProject(project.id, deps);
  assert.equal(finished.status, "completed");
  assert.ok(finished.tasks.every((task) => task.status === "done"));
  assert.equal(finished.resultBranch, "agent/project-final");
  assert.equal(finished.resultCommit, "final-commit");

  const result = buildProjectResult(finished);
  assert.equal(result?.status, "completed");
  assert.equal(result?.completedTasks, 2);
  assert.equal(result?.failedTasks, 0);

  const events = await storage.listEvents(project.id);
  assert.ok(events.some((event) => event.type === "project.completed"));
  assert.ok(events.some((event) => event.type === "task.completed"));
  assert.ok(events.some((event) => event.type === "task.review_passed"));
});

test("conflicto de integración Git bloquea la tarea y el proyecto", async () => {
  const storage = new InMemoryStorage();
  await storage.init();
  const deps = baseDeps(storage, fakeWorkspace("TASK-002"));

  const project = await createProject({ goal: "x" }, deps);
  const finished = await runProject(project.id, deps);

  const task2 = finished.tasks.find((task) => task.id === "TASK-002");
  assert.equal(task2?.status, "blocked");
  assert.equal(task2?.integrationError?.type, "git_conflict");
  assert.equal(finished.status, "blocked");

  const events = await storage.listEvents(project.id);
  assert.ok(events.some((event) => event.type === "git.conflict"));
});

test("wantsDevSmoke solo cuando la tarea menciona el arranque", () => {
  assert.equal(
    wantsDevSmoke({
      id: "T",
      title: "t",
      description: "Ejecutar 'npm run dev' y comprobar el servidor",
      status: "ready",
      type: "coding",
      complexity: "low",
    }),
    true,
  );

  assert.equal(
    wantsDevSmoke({
      id: "T",
      title: "t",
      description: "Añade un endpoint de suma",
      status: "ready",
      type: "coding",
      complexity: "low",
      acceptanceCriteria: ["npm test pasa"],
    }),
    false,
  );
});

test("mergeReplan reemplaza una tarea fallida si el planner la redefine", () => {
  const existing: Task[] = [
    {
      id: "TASK-001",
      title: "a",
      description: "a",
      status: "done",
      type: "coding",
      complexity: "low",
    },
    {
      id: "TASK-006",
      title: "viejo",
      description: "verificación manual",
      status: "failed",
      type: "testing",
      complexity: "low",
      acceptanceCriteria: ["Comprobar manualmente el flujo"],
    },
  ];

  const merged = mergeReplan(existing, {
    summary: "replan",
    tasks: [
      {
        id: "TASK-006",
        title: "nuevo",
        description: "tests automatizados",
        type: "testing",
        complexity: "low",
        dependsOn: [],
        acceptanceCriteria: ["npm test pasa"],
        attachments: [],
      },
    ],
  });

  const task6 = merged.find((task) => task.id === "TASK-006");
  assert.equal(task6?.title, "nuevo");
  assert.deepEqual(task6?.acceptanceCriteria, ["npm test pasa"]);
  assert.equal(task6?.status, "todo");
});

test("mergeReplan conserva una tarea fallida que el planner no redefine", () => {
  const existing: Task[] = [
    {
      id: "TASK-006",
      title: "viejo",
      description: "verificación manual",
      status: "failed",
      type: "testing",
      complexity: "low",
      acceptanceCriteria: ["Comprobar manualmente el flujo"],
    },
  ];

  const merged = mergeReplan(existing, {
    summary: "replan",
    tasks: [
      {
        id: "TASK-007",
        title: "extra",
        description: "extra",
        type: "coding",
        complexity: "low",
        dependsOn: [],
        acceptanceCriteria: [],
        attachments: [],
      },
    ],
  });

  const task6 = merged.find((task) => task.id === "TASK-006");
  assert.equal(task6?.title, "viejo");
  assert.equal(task6?.status, "todo");
});

test("mergeReplan aplica la redefinición de una tarea bloqueada", () => {
  const existing: Task[] = [
    {
      id: "TASK-001",
      title: "esqueleto complejo",
      description: "viejo",
      status: "done",
      type: "coding",
      complexity: "high",
    },
    {
      id: "TASK-002",
      title: "lógica compleja",
      description: "viejo",
      status: "blocked",
      type: "coding",
      complexity: "high",
      dependsOn: ["TASK-001"],
      blockedReason: "esperando a TASK-001",
      chatId: "chat-1",
      attempts: [
        {
          agent: { provider: "claude" },
          attempt: 1,
          startedAt: new Date(),
          finishedAt: new Date(),
          status: "failed",
        },
      ],
      acceptanceCriteria: ["manual"],
    },
  ];

  const merged = mergeReplan(existing, {
    summary: "replan",
    tasks: [
      {
        id: "TASK-002",
        title: "calendario mensual simplificado",
        description: "JavaScript puro, sin dependencias",
        type: "coding",
        complexity: "low",
        dependsOn: ["TASK-001"],
        acceptanceCriteria: ["node --test pasa"],
        attachments: [],
      },
    ],
  });

  const task2 = merged.find((task) => task.id === "TASK-002");
  assert.equal(task2?.title, "calendario mensual simplificado");
  assert.equal(task2?.complexity, "low");
  assert.deepEqual(task2?.acceptanceCriteria, ["node --test pasa"]);
  assert.equal(task2?.status, "todo");
  assert.equal(task2?.blockedReason, undefined);
  assert.equal(task2?.attempts, undefined);
  // Los datos de ejecución que no vienen en el plan se conservan.
  assert.equal(task2?.chatId, "chat-1");
  // La tarea completada no se reescribe.
  assert.equal(merged.find((task) => task.id === "TASK-001")?.title, "esqueleto complejo");
});

test("mergeReplan no añade tareas que duplican el título de una existente", () => {
  const existing: Task[] = [
    {
      id: "TASK-001",
      title: "Estructura base",
      description: "x",
      status: "done",
      type: "coding",
      complexity: "low",
    },
  ];

  const merged = mergeReplan(existing, {
    summary: "replan",
    tasks: [
      {
        id: "TASK-001A",
        title: "estructura base",
        description: "duplicado con otro id",
        type: "coding",
        complexity: "low",
        dependsOn: [],
        acceptanceCriteria: [],
        attachments: [],
      },
      {
        id: "TASK-002",
        title: "Otra cosa distinta",
        description: "y",
        type: "coding",
        complexity: "low",
        dependsOn: [],
        acceptanceCriteria: [],
        attachments: [],
      },
    ],
  });

  assert.equal(merged.some((task) => task.id === "TASK-001A"), false);
  assert.equal(merged.some((task) => task.id === "TASK-002"), true);
});

test("integra las dependencias transitivas en orden topológico", async () => {
  const storage = new InMemoryStorage();
  await storage.init();

  const chainPlan = {
    summary: "cadena",
    tasks: [
      {
        id: "TASK-001",
        title: "a",
        description: "a",
        type: "coding",
        complexity: "low",
        dependsOn: [],
        acceptanceCriteria: [],
      },
      {
        id: "TASK-002",
        title: "b",
        description: "b",
        type: "coding",
        complexity: "low",
        dependsOn: ["TASK-001"],
        acceptanceCriteria: [],
      },
      {
        id: "TASK-003",
        title: "c",
        description: "c",
        type: "coding",
        complexity: "low",
        dependsOn: ["TASK-002"],
        acceptanceCriteria: [],
      },
    ],
  };

  const integrations = new Map<string, string[]>();
  let commits = 0;

  const workspace: WorkspaceManager = {
    ...fakeWorkspace(),
    commit: async () => {
      commits += 1;
      return `commit-${commits}`;
    },
    integrateDependencies: async (taskId, dependencyCommits, baseRef) => {
      integrations.set(
        taskId,
        dependencyCommits.map((entry) => entry.taskId),
      );
      return { ok: true, ref: baseRef, branchName: `integration/${taskId}` };
    },
  };

  const deps: ProjectDeps = {
    ...baseDeps(storage, workspace),
    plannerExecute: async () => JSON.stringify(chainPlan),
  };

  const project = await createProject({ goal: "cadena" }, deps);
  const finished = await runProject(project.id, deps);

  assert.equal(finished.status, "completed");
  assert.deepEqual(integrations.get("TASK-001"), []);
  assert.deepEqual(integrations.get("TASK-002"), ["TASK-001"]);
  assert.deepEqual(integrations.get("TASK-003"), ["TASK-001", "TASK-002"]);
});

test("una tarea sin dependencias parte del trabajo ya completado", async () => {
  const storage = new InMemoryStorage();
  await storage.init();

  const integrations = new Map<string, string[]>();
  const workspace: WorkspaceManager = {
    ...fakeWorkspace(),
    integrateDependencies: async (taskId, dependencyCommits, baseRef) => {
      integrations.set(
        taskId,
        dependencyCommits.map((entry) => entry.taskId),
      );
      return { ok: true, ref: baseRef, branchName: `integration/${taskId}` };
    },
  };

  const deps = baseDeps(storage, workspace);

  const project: Project = {
    id: "proj-orphan",
    name: "orphan",
    goal: "x",
    status: "paused",
    baseRef: "base0",
    tasks: [
      {
        id: "TASK-001",
        title: "base",
        description: "base",
        status: "done",
        type: "coding",
        complexity: "low",
        resultCommit: "commit-1",
      },
      {
        id: "TASK-005A",
        title: "diagnóstico",
        description: "diagnóstico",
        status: "todo",
        type: "coding",
        complexity: "low",
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await storage.saveProject(project);

  const finished = await resumeProject("proj-orphan", deps);

  assert.equal(finished.status, "completed");
  // Sin esto la tarea corría en un worktree vacío.
  assert.deepEqual(integrations.get("TASK-005A"), ["TASK-001"]);
});

test("crash recovery: running abandonada se recupera y ejecuta", async () => {
  const storage = new InMemoryStorage();
  await storage.init();
  const deps = baseDeps(storage, fakeWorkspace());

  const project: Project = {
    id: "proj-crash",
    name: "crash",
    goal: "x",
    status: "running",
    baseRef: "base0",
    tasks: [
      {
        id: "TASK-001",
        title: "base",
        description: "base",
        status: "running",
        type: "coding",
        complexity: "low",
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await storage.saveProject(project);

  const recovered = recoverInterrupted(project);
  assert.equal(recovered.tasks[0]?.status, "interrupted");

  const finished = await runProject("proj-crash", deps);
  assert.equal(finished.status, "completed");
  assert.equal(finished.tasks[0]?.status, "done");
});

test("requeueFailedTasks reencola fallidas y bloqueadas por conflicto", () => {
  const project: Project = {
    id: "p",
    name: "p",
    goal: "x",
    status: "paused",
    baseRef: "base0",
    tasks: [
      {
        id: "TASK-001",
        title: "fallida",
        description: "x",
        status: "failed",
        type: "coding",
        complexity: "low",
        error: "[sandbox] comando no permitido: ls",
        startedAt: new Date(),
        finishedAt: new Date(),
      },
      {
        id: "TASK-002",
        title: "bloqueada",
        description: "x",
        status: "blocked",
        type: "coding",
        complexity: "low",
        dependsOn: ["TASK-001"],
        blockedReason: "bloqueada por TASK-001 (failed)",
      },
      {
        id: "TASK-003",
        title: "conflicto",
        description: "x",
        status: "blocked",
        type: "coding",
        complexity: "low",
        integrationError: {
          type: "git_conflict",
          dependencyTaskIds: ["TASK-001"],
          files: ["package.json"],
          message: "conflicto",
        },
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const next = requeueFailedTasks(project);
  const failed = next.tasks.find((task) => task.id === "TASK-001");
  assert.equal(failed?.status, "todo");
  assert.equal(failed?.error, undefined);
  assert.equal(failed?.startedAt, undefined);
  // Las bloqueadas se conservan: el scheduler las recalcula.
  assert.equal(
    next.tasks.find((task) => task.id === "TASK-002")?.status,
    "blocked",
  );
  // Una bloqueada por conflicto de integración sí se reintenta.
  const conflict = next.tasks.find((task) => task.id === "TASK-003");
  assert.equal(conflict?.status, "todo");
  assert.equal(conflict?.integrationError, undefined);
});

test("resume reencola las tareas fallidas y las vuelve a ejecutar", async () => {
  const storage = new InMemoryStorage();
  await storage.init();
  const deps = baseDeps(storage, fakeWorkspace());

  const project: Project = {
    id: "proj-resume",
    name: "resume",
    goal: "x",
    status: "paused",
    baseRef: "base0",
    tasks: [
      {
        id: "TASK-001",
        title: "base",
        description: "base",
        status: "failed",
        type: "coding",
        complexity: "low",
        error: "[sandbox] comando no permitido: ls",
      },
      {
        id: "TASK-002",
        title: "ui",
        description: "ui",
        status: "blocked",
        type: "coding",
        complexity: "low",
        dependsOn: ["TASK-001"],
        blockedReason: "bloqueada por TASK-001 (failed)",
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await storage.saveProject(project);

  const finished = await resumeProject("proj-resume", deps);
  assert.equal(finished.status, "completed");
  assert.ok(finished.tasks.every((task) => task.status === "done"));
});

test("crash recovery: planning vuelve a draft y running a paused", async () => {
  const storage = new InMemoryStorage();
  await storage.init();
  const deps = baseDeps(storage, fakeWorkspace());

  const now = new Date();
  const planning: Project = {
    id: "proj-planning",
    name: "planning",
    goal: "x",
    status: "planning",
    baseRef: "base0",
    tasks: [],
    createdAt: now,
    updatedAt: now,
  };
  const running: Project = {
    id: "proj-running",
    name: "running",
    goal: "x",
    status: "running",
    baseRef: "base0",
    tasks: [
      {
        id: "TASK-001",
        title: "base",
        description: "base",
        status: "running",
        type: "coding",
        complexity: "low",
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
  const ready: Project = {
    id: "proj-ready",
    name: "ready",
    goal: "x",
    status: "ready",
    baseRef: "base0",
    tasks: [],
    createdAt: now,
    updatedAt: now,
  };

  await storage.saveProject(planning);
  await storage.saveProject(running);
  await storage.saveProject(ready);

  const recovered = await recoverInterruptedProjects(deps);
  assert.equal(recovered.length, 2);

  const storedPlanning = await storage.getProject("proj-planning");
  assert.equal(storedPlanning?.status, "draft");

  const storedRunning = await storage.getProject("proj-running");
  assert.equal(storedRunning?.status, "paused");
  assert.equal(storedRunning?.tasks[0]?.status, "interrupted");

  const storedReady = await storage.getProject("proj-ready");
  assert.equal(storedReady?.status, "ready");

  const events = await storage.listEvents("proj-planning");
  assert.ok(events.some((event) => event.type === "project.recovered"));
});

test("progreso incremental: las tareas completadas se persisten antes de terminar la ronda", async () => {
  const storage = new InMemoryStorage();
  await storage.init();
  const workspace = fakeWorkspace();

  let calls = 0;
  let snapshot: string | undefined;

  const deps: ProjectDeps = {
    storage,
    workspace,
    plannerExecute: async () => JSON.stringify(planA),
    workerExecute: async () => "ok",
    reviewerExecute: async () =>
      JSON.stringify({ approved: true, summary: "ok", issues: [] }),
    supervisorExecute: async () =>
      JSON.stringify({ action: "continue", reason: "ok" }),
  };

  const project = await createProject({ goal: "x" }, deps);

  deps.workerExecute = async () => {
    calls += 1;

    if (calls === 2) {
      const stored = await storage.getProject(project.id);
      snapshot = stored?.tasks
        .map((task) => `${task.id}:${task.status}`)
        .join(",");
    }

    return "ok";
  };

  await runProject(project.id, deps);

  assert.equal(snapshot, "TASK-001:done,TASK-002:running");
});

test("los agentes marcados al crear el proyecto se aplican a las tareas del plan", async () => {
  const storage = new InMemoryStorage();
  await storage.init();
  const workspace = fakeWorkspace();

  const executed: unknown[] = [];

  const deps: ProjectDeps = {
    storage,
    workspace,
    plannerExecute: async () => JSON.stringify(planA),
    workerExecute: async (_prompt, agent) => {
      executed.push(agent);
      return "ok";
    },
    reviewerExecute: async () =>
      JSON.stringify({ approved: true, summary: "ok", issues: [] }),
    supervisorExecute: async () =>
      JSON.stringify({ action: "continue", reason: "ok" }),
  };

  const project = await createProject(
    {
      goal: "crear librería",
      defaultAllowedAgents: [{ provider: "codex" }],
    },
    deps,
  );

  const finished = await runProject(project.id, deps);

  assert.equal(finished.status, "completed");
  assert.ok(executed.length > 0);
  // Las tareas son coding/low, que por defecto irían a deepseek-flash; la
  // restricción del proyecto debe redirigirlas a codex.
  assert.ok(
    executed.every((agent) => (agent as { provider: string }).provider === "codex"),
  );
});

test("createProject: acepta una selección de solo DeepSeek (escribe con el harness)", async () => {
  const storage = new InMemoryStorage();
  await storage.init();
  const deps: ProjectDeps = {
    storage,
    plannerExecute: async () => JSON.stringify(planA),
  };

  const project = await createProject(
    {
      goal: "crear algo",
      defaultAllowedAgents: [
        { provider: "deepseek", model: "deepseek-flash" },
      ],
    },
    deps,
  );

  assert.deepEqual(project.defaultAllowedAgents, [
    { provider: "deepseek", model: "deepseek-flash" },
  ]);
});

test("shouldSkipReview: solo en tareas low sin criterios con checks en verde", () => {
  const task = {
    id: "TASK-001",
    title: "t",
    description: "d",
    status: "done",
    type: "coding",
    complexity: "low",
    acceptanceCriteria: [],
  } as Task;

  const ok: CheckResult = { command: "npm run test", success: true };
  const fail: CheckResult = { command: "npm run test", success: false };

  assert.equal(shouldSkipReview(task, [ok]), true);
  assert.equal(shouldSkipReview(task, []), false);
  assert.equal(
    shouldSkipReview({ ...task, acceptanceCriteria: ["x"] }, [ok]),
    false,
  );
  assert.equal(shouldSkipReview({ ...task, complexity: "medium" }, [ok]), false);
  assert.equal(shouldSkipReview(task, [fail]), false);
});

test("review: el reviewer corre en el worktree del intento", async () => {
  const storage = new InMemoryStorage();
  await storage.init();

  const cwds: Array<string | undefined> = [];

  const deps: ProjectDeps = {
    storage,
    workspace: fakeWorkspace(),
    plannerExecute: async () => JSON.stringify(singleTaskPlan),
    workerExecute: async () => "ok",
    reviewerExecute: async (_prompt, _agent, options) => {
      cwds.push(options?.cwd);
      return JSON.stringify({ approved: true, summary: "ok", issues: [] });
    },
    supervisorExecute: async () =>
      JSON.stringify({ action: "continue", reason: "ok" }),
  };

  const project = await createProject({ goal: "x" }, deps);
  const finished = await runProject(project.id, deps);

  assert.equal(finished.status, "completed");
  assert.ok(cwds.length >= 1);
  assert.match(cwds[0] ?? "", /\.worktrees\/TASK-001-/);
});

test("review→fix: el segundo ciclo parte del commit del primero", async () => {
  const storage = new InMemoryStorage();
  await storage.init();

  const createBases: Array<{ taskId: string; baseRef: string }> = [];
  const base = fakeWorkspace();
  const workspace: WorkspaceManager = {
    ...base,
    create: async (taskId, attempt, baseRef) => {
      createBases.push({ taskId, baseRef });
      return base.create(taskId, attempt, baseRef);
    },
  };

  let reviewCalls = 0;

  const deps: ProjectDeps = {
    storage,
    workspace,
    plannerExecute: async () => JSON.stringify(singleTaskPlan),
    workerExecute: async () => "ok",
    reviewerExecute: async () => {
      reviewCalls += 1;
      return JSON.stringify(
        reviewCalls === 1
          ? {
              approved: false,
              summary: "no cumple",
              issues: [{ severity: "high", description: "falta algo" }],
            }
          : { approved: true, summary: "ok", issues: [] },
      );
    },
    supervisorExecute: async () =>
      JSON.stringify({ action: "continue", reason: "ok" }),
  };

  const project = await createProject({ goal: "x" }, deps);
  const finished = await runProject(project.id, deps);

  assert.equal(finished.status, "completed");
  assert.equal(reviewCalls, 2);

  // Se ignoran los worktrees de checks (`TASK-001-checks`).
  const bases = createBases
    .filter((entry) => entry.taskId === "TASK-001")
    .map((entry) => entry.baseRef);

  // El primer ciclo parte de la base; el segundo, del commit del primero.
  assert.deepEqual(bases, ["base0", "commit-1"]);
});

test("review→fix: el segundo rechazo al mismo agente escala a otro", async () => {
  const storage = new InMemoryStorage();
  await storage.init();

  const workers: string[] = [];
  let reviewCalls = 0;

  const deps: ProjectDeps = {
    storage,
    workspace: fakeWorkspace(),
    plannerExecute: async () => JSON.stringify(singleTaskPlan),
    workerExecute: async (_prompt, agent) => {
      workers.push(describeAgent(agent));
      return "ok";
    },
    reviewerExecute: async () => {
      reviewCalls += 1;
      return JSON.stringify(
        reviewCalls <= 2
          ? {
              approved: false,
              summary: "no cumple",
              issues: [{ severity: "high", description: "falta algo" }],
            }
          : { approved: true, summary: "ok", issues: [] },
      );
    },
    supervisorExecute: async () =>
      JSON.stringify({ action: "continue", reason: "ok" }),
  };

  const project = await createProject({ goal: "x" }, deps);
  const finished = await runProject(project.id, deps);

  assert.equal(finished.status, "completed");
  assert.equal(workers.length, 3);
  // El primer rechazo lo corrige el mismo agente; el segundo, otro.
  assert.equal(workers[1], workers[0]);
  assert.notEqual(workers[2], workers[0]);
});

test("review caído: la tarea falla sin rehacer el trabajo del worker", async () => {
  const storage = new InMemoryStorage();
  await storage.init();

  let workerCalls = 0;

  const deps: ProjectDeps = {
    storage,
    workspace: fakeWorkspace(),
    plannerExecute: async () => JSON.stringify(singleTaskPlan),
    workerExecute: async () => {
      workerCalls += 1;
      return "ok";
    },
    reviewerExecute: async () => "no soy json",
    supervisorExecute: async () =>
      JSON.stringify({ action: "fail", reason: "reviewer caído" }),
  };

  const project = await createProject({ goal: "x" }, deps);
  const finished = await runProject(project.id, deps);
  const task = finished.tasks.find((entry) => entry.id === "TASK-001");

  assert.equal(workerCalls, 1);
  assert.equal(task?.status, "failed");
  assert.match(task?.error ?? "", /review no parseable/);
});

test("replanificación: el supervisor añade una tarea y el proyecto completa", async () => {
  const storage = new InMemoryStorage();
  await storage.init();
  const workspace = fakeWorkspace();

  let plannerCalls = 0;
  let workerCalls = 0;
  let supervisorCalls = 0;

  const deps: ProjectDeps = {
    storage,
    workspace,
    plannerExecute: async () => {
      plannerCalls += 1;
      return JSON.stringify(plannerCalls === 1 ? planA : planWithExtra);
    },
    workerExecute: async () => {
      workerCalls += 1;
      // Falla toda la cadena de fallback del primer intento (4 candidatos).
      if (workerCalls <= 4) {
        throw new Error("boom");
      }
      return "ok";
    },
    reviewerExecute: async () =>
      JSON.stringify({ approved: true, summary: "ok", issues: [] }),
    supervisorExecute: async () => {
      supervisorCalls += 1;
      return JSON.stringify({
        action: "replan",
        reason: "falta una tarea",
        instructions: "añade TASK-003",
      });
    },
  };

  const project = await createProject({ goal: "x" }, deps);
  const finished = await runProject(project.id, deps);

  assert.equal(supervisorCalls, 1);
  assert.equal(plannerCalls, 2);
  assert.equal(finished.status, "completed");
  assert.ok(finished.tasks.some((task) => task.id === "TASK-003"));
  assert.ok(finished.tasks.every((task) => task.status === "done"));

  const events = await storage.listEvents(project.id);
  assert.ok(events.some((event) => event.type === "supervisor.replan"));
});

test("el resultado se vuelca en el directorio del proyecto al completar", async () => {
  const storage = new InMemoryStorage();
  await storage.init();
  const synced: string[] = [];
  const deps = baseDeps(storage, fakeWorkspace(undefined, synced));

  const project = await createProject({ goal: "crear librería" }, deps);
  const finished = await runProject(project.id, deps);

  assert.equal(finished.status, "completed");

  // Sin este volcado el trabajo se queda dentro de git y el directorio del
  // proyecto no llega a tener ni un archivo.
  assert.deepEqual(synced, ["final-commit"]);

  const events = await storage.listEvents(project.id);
  assert.ok(events.some((event) => event.type === "worktree.synced"));
});

test("un plan bloqueado deja en disco lo que sí se completó", async () => {
  const storage = new InMemoryStorage();
  await storage.init();
  const synced: string[] = [];
  const progressCommits: string[][] = [];
  const deps = baseDeps(
    storage,
    fakeWorkspace("TASK-002", synced, progressCommits),
  );

  const project = await createProject({ goal: "x" }, deps);
  const finished = await runProject(project.id, deps);

  assert.equal(finished.status, "blocked");

  // TASK-001 terminó: su trabajo baja al directorio aunque el plan no acabe,
  // para que el usuario lo vea y el supervisor no razone sobre un repo vacío.
  assert.ok(progressCommits.length > 0);
  assert.deepEqual(progressCommits[0], ["TASK-001"]);
  assert.ok(synced.includes("progress-commit"));
});

test("gatherRepoContext reúne scripts y estructura real del repo", async () => {
  const dir = mkdtempSync(join(tmpdir(), "repo-ctx-"));

  try {
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ scripts: { test: "node --test", build: "tsc" } }),
    );
    writeFileSync(join(dir, "README.md"), "");
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "index.js"), "");
    mkdirSync(join(dir, "node_modules"));

    const context = await gatherRepoContext(dir);

    assert.deepEqual(context.scripts, ["build", "test"]);
    assert.ok(context.files?.includes("src/"));
    assert.ok(context.files?.includes("src/index.js"));
    assert.ok(context.files?.includes("README.md"));
    // Los directorios ignorados no aparecen.
    assert.equal(
      context.files?.some((file) => file.startsWith("node_modules")),
      false,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("repeatedFailures detecta la misma causa en rondas consecutivas", () => {
  const previous = new Map<string, string>();
  const failed = (id: string, error: string): Task => ({
    id,
    title: id,
    description: "d",
    status: "failed",
    type: "coding",
    complexity: "low",
    error,
  });

  // Primera ronda: solo registra.
  assert.deepEqual(
    repeatedFailures(
      [failed("TASK-005A", "[harness] agotadas 24 iteraciones"), failed("TASK-002", "429 rate limit")],
      previous,
    ),
    [],
  );

  // Segunda ronda: misma causa en TASK-005A; el rate limit no cuenta.
  assert.deepEqual(
    repeatedFailures(
      [failed("TASK-005A", "[harness] agotadas 40 iteraciones"), failed("TASK-002", "429 rate limit")],
      previous,
    ),
    [{ id: "TASK-005A", kind: "harness: iteraciones" }],
  );

  // Una causa distinta no dispara el cortafuegos.
  assert.deepEqual(
    repeatedFailures([failed("TASK-005A", '[sandbox] comando no permitido: "pwd"')], previous),
    [],
  );
});

test("renderWorkspaceMap lista scripts y archivos sin node_modules", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wsmap-"));
  try {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }));
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "app.js"), "");
    mkdirSync(join(dir, "node_modules"));

    const map = await renderWorkspaceMap(dir);

    assert.match(map ?? "", /Scripts de npm: test/);
    assert.match(map ?? "", /src\/app\.js/);
    assert.doesNotMatch(map ?? "", /node_modules/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("renderWorkspaceMap usa la app de la subcarpeta y avisa de dependencias ya instaladas", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wsmap-"));
  try {
    mkdirSync(join(dir, "kanban-app", "node_modules"), { recursive: true });
    writeFileSync(
      join(dir, "kanban-app", "package.json"),
      JSON.stringify({ scripts: { typecheck: "tsc", build: "vite build" } }),
    );

    const map = await renderWorkspaceMap(dir);

    assert.match(map ?? "", /Scripts de npm \(en kanban-app\/\): typecheck, build/);
    assert.match(map ?? "", /Dependencias: ya instaladas/);
    assert.match(map ?? "", /no hay AGENTS\.md/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("modo rápido: el planner lo sabe y la tarea no pasa por checks ni reviewer", async () => {
  const storage = new InMemoryStorage();
  await storage.init();

  let plannerPrompt = "";
  let reviewCalls = 0;

  const deps: ProjectDeps = {
    storage,
    workspace: fakeWorkspace(),
    plannerExecute: async (prompt) => {
      plannerPrompt = prompt;
      return JSON.stringify({
        ...singleTaskPlan,
        tasks: [{ ...singleTaskPlan.tasks[0], acceptanceCriteria: ["existe index.html"] }],
      });
    },
    workerExecute: async () => "ok",
    reviewerExecute: async () => {
      reviewCalls += 1;
      return JSON.stringify({ approved: false, summary: "no", issues: [] });
    },
    supervisorExecute: async () =>
      JSON.stringify({ action: "continue", reason: "ok" }),
  };

  const project = await createProject(
    { goal: "x", config: { ...defaultConfig, fastMode: true } },
    deps,
  );
  const finished = await runProject(project.id, deps);

  assert.match(plannerPrompt, /MODO RÁPIDO/);
  assert.equal(reviewCalls, 0);
  assert.equal(finished.status, "completed");
  const events = await storage.listEvents(project.id);
  assert.equal(events.some((event) => event.type === "checks.completed"), false);
});

test("adjuntos del objetivo: se guardan, llegan al planner y se enlazan a las tareas", async () => {
  const storage = new InMemoryStorage();
  await storage.init();
  const prompts: string[] = [];
  const deps: ProjectDeps = {
    ...baseDeps(storage, fakeWorkspace()),
    plannerExecute: async (prompt: string) => {
      prompts.push(prompt);
      return JSON.stringify({
        ...planA,
        tasks: planA.tasks.map((task, index) => ({
          ...task,
          attachments: index === 0 ? ["ADJ-1"] : [],
        })),
      });
    },
  };
  const notes = "# Requisitos\nUsar tema oscuro";

  const draft = await createProjectDraft(
    {
      goal: "crear librería",
      attachments: [
        {
          name: "requisitos.md",
          type: "markdown",
          mimeType: "text/markdown",
          size: Buffer.byteLength(notes),
          data: Buffer.from(notes).toString("base64"),
        },
      ],
    },
    deps,
  );
  assert.equal(draft.attachments?.length, 1);
  assert.equal(draft.attachments?.[0]?.name, "requisitos.md");

  const planned = await generatePlan(draft.id, deps);
  assert.ok(prompts[0]?.includes("Usar tema oscuro"));
  assert.deepEqual(planned.tasks[0]?.attachmentIds, [draft.attachments?.[0]?.id]);
  assert.equal(planned.tasks[1]?.attachmentIds, undefined);
  assert.equal(planned.attachments?.length, 1);
});
