import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createProject,
  type ProjectDeps,
} from "../projects/service.js";
import { InMemoryStorage } from "../storage/memory.js";
import type { WorkspaceManager } from "../workspace/types.js";
import { buildProjectGraph } from "./graph.js";

const planA = {
  summary: "A",
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
  summary: "B",
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

function fakeWorkspace(): WorkspaceManager {
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
    integrateDependencies: async (_taskId, _commits, baseRef) => ({
      ok: true,
      ref: baseRef,
      branchName: "integration/x",
    }),
    finalizeProject: async () => ({
      ok: true,
      ref: "final-commit",
      branchName: "agent/project-final",
    }),
  };
}

function baseDeps(storage: InMemoryStorage): ProjectDeps {
  return {
    storage,
    workspace: fakeWorkspace(),
    plannerExecute: async () => JSON.stringify(planA),
    workerExecute: async () => "ok",
    reviewerExecute: async () =>
      JSON.stringify({ approved: true, summary: "ok", issues: [] }),
    supervisorExecute: async () =>
      JSON.stringify({ action: "continue", reason: "ok" }),
  };
}

test("langgraph: plan → run → supervise → finalize → completed", async () => {
  const storage = new InMemoryStorage();
  await storage.init();
  const deps = baseDeps(storage);

  const project = await createProject({ goal: "x" }, deps);
  const app = buildProjectGraph(deps);

  const finalState = await app.invoke(
    {
      projectId: project.id,
      lastCompletedTaskIds: [],
      lastFailedTaskIds: [],
      rounds: 0,
    },
    { configurable: { thread_id: "t1" } },
  );

  assert.equal(finalState.project?.status, "completed");
  assert.equal(finalState.project?.resultBranch, "agent/project-final");
  assert.deepEqual(finalState.lastCompletedTaskIds.sort(), [
    "TASK-001",
    "TASK-002",
  ]);
});

test("langgraph: supervisor replan → planner → completed", async () => {
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
        reason: "falta tarea",
        instructions: "añade TASK-003",
      });
    },
  };

  const project = await createProject({ goal: "x" }, deps);
  const app = buildProjectGraph(deps);

  const finalState = await app.invoke(
    {
      projectId: project.id,
      lastCompletedTaskIds: [],
      lastFailedTaskIds: [],
      rounds: 0,
    },
    { configurable: { thread_id: "t2" } },
  );

  assert.equal(supervisorCalls, 1);
  assert.equal(plannerCalls, 2);
  assert.equal(finalState.project?.status, "completed");
  assert.ok(finalState.project?.tasks.some((task) => task.id === "TASK-003"));
});
