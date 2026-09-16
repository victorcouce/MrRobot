import assert from "node:assert/strict";
import { test } from "node:test";
import { InMemoryStorage } from "../storage/memory.js";
import type { WorkspaceManager } from "../workspace/types.js";
import {
  buildProjectResult,
  createProject,
  recoverInterrupted,
  runProject,
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

function fakeWorkspace(conflictOn?: string): WorkspaceManager {
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
      // Falla toda la cadena de fallback del primer intento (3 candidatos).
      if (workerCalls <= 3) {
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
