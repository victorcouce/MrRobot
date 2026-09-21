import assert from "node:assert/strict";
import { test } from "node:test";
import { CLAUDE_SONNET, CODEX } from "../agents/selector.js";
import type { AgentSpec } from "../agents/types.js";
import type { TaskWorkspace, WorkspaceManager } from "../workspace/types.js";
import { runTask } from "./runner.js";
import type { Task } from "./types.js";

const DEEPSEEK: AgentSpec = { provider: "deepseek", model: "deepseek-flash" };

function fakeWorkspace(commitResult: string | undefined): WorkspaceManager {
  return {
    getRepoRoot: async () => "/fake/repo",
    resolveBaseRef: async () => "base0",
    isDirty: async () => false,
    create: async (taskId, attempt, baseRef): Promise<TaskWorkspace> => ({
      taskId,
      branchName: `agent/${taskId}-attempt-${attempt}`,
      path: `/fake/repo/.worktrees/${taskId}-${attempt}`,
      baseRef,
    }),
    commit: async () => commitResult,
    squash: async () => "squashed",
    remove: async () => {},
    diff: async () => "",
    integrateDependencies: async () => ({
      ok: true,
      ref: "base0",
      branchName: "integration",
    }),
    finalizeProject: async () => ({
      ok: true,
      ref: "final",
      branchName: "final",
    }),
  };
}

function task(overrides: Partial<Task>): Task {
  return {
    id: "TASK-001",
    title: "t",
    description: "d",
    status: "ready",
    type: "coding",
    complexity: "low",
    ...overrides,
  };
}

test("runTask: una tarea de código sin cambios falla", async () => {
  const result = await runTask(
    task({ type: "coding" }),
    {
      execute: async () => "```js\nconsole.log('hola')\n```",
      workspace: fakeWorkspace(undefined),
      allowedAgents: [DEEPSEEK],
    },
  );

  assert.equal(result.status, "failed");
  assert.match(result.error ?? "", /no creó ni modificó ningún archivo/);
  assert.equal(result.resultCommit, undefined);
});

test("runTask: una tarea de código con commit se completa", async () => {
  const result = await runTask(
    task({ type: "coding" }),
    {
      execute: async () => "ok",
      workspace: fakeWorkspace("abc123"),
      allowedAgents: [DEEPSEEK],
    },
  );

  assert.equal(result.status, "done");
  assert.equal(result.resultCommit, "abc123");
});

test("runTask: una tarea que no es de código puede no producir commit", async () => {
  const result = await runTask(
    task({ type: "planning" }),
    {
      execute: async () => "documento de plan",
      workspace: fakeWorkspace(undefined),
      allowedAgents: [DEEPSEEK],
    },
  );

  assert.equal(result.status, "done");
  assert.equal(result.resultCommit, undefined);
});

test("runTask: avisa a onWorkspaceSuccess de que hubo cambios", async () => {
  const calls: boolean[] = [];

  await runTask(task({ type: "coding" }), {
    execute: async () => "ok",
    workspace: fakeWorkspace("abc123"),
    allowedAgents: [CLAUDE_SONNET],
    onWorkspaceSuccess: (_ws, changed) => {
      calls.push(changed);
    },
  });

  assert.deepEqual(calls, [true]);
});

test("runTask: sin cambios no pide checks", async () => {
  const calls: boolean[] = [];

  await runTask(task({ type: "planning" }), {
    execute: async () => "texto",
    workspace: fakeWorkspace(undefined),
    allowedAgents: [DEEPSEEK],
    onWorkspaceSuccess: (_ws, changed) => {
      calls.push(changed);
    },
  });

  assert.deepEqual(calls, [false]);
});

test("runTask: reancla criterios absolutos del repo en el prompt", async () => {
  let prompt = "";

  const result = await runTask(
    task({
      type: "coding",
      acceptanceCriteria: ["existe /fake/repo/package.json"],
    }),
    {
      execute: async (value) => {
        prompt = value;
        return "ok";
      },
      workspace: fakeWorkspace("abc123"),
      allowedAgents: [CLAUDE_SONNET],
    },
  );

  assert.equal(result.status, "done");
  assert.match(prompt, /existe package\.json/);
  assert.doesNotMatch(prompt, /\/fake\/repo\/package\.json/);
});

test("runTask: onWorkspaceSuccess recibe commit y salida", async () => {
  const seen: Array<{ commit?: string; output: string }> = [];

  await runTask(task({ type: "coding" }), {
    execute: async () => "salida del agente",
    workspace: fakeWorkspace("abc123"),
    allowedAgents: [CLAUDE_SONNET],
    onWorkspaceSuccess: (_ws, _changed, info) => {
      seen.push(info);
    },
  });

  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.commit, "abc123");
  assert.equal(seen[0]?.output, "salida del agente");
});

test("runTask: un reintento exitoso limpia el error anterior", async () => {
  const result = await runTask(
    task({
      type: "coding",
      error: "review no aprobado tras 3 ciclos",
      blockedReason: "bloqueada",
    }),
    {
      execute: async () => "ok",
      workspace: fakeWorkspace("abc123"),
      allowedAgents: [CLAUDE_SONNET],
    },
  );

  assert.equal(result.status, "done");
  assert.equal(result.error, undefined);
  assert.equal(result.blockedReason, undefined);
});

test("runTask: la tarea de código arranca por el primer agente que escribe", async () => {
  const executed: string[] = [];

  const result = await runTask(task({ type: "coding", complexity: "low" }), {
    execute: async (_prompt, agent) => {
      executed.push(agent.provider);
      return "ok";
    },
    workspace: fakeWorkspace("abc123"),
  });

  assert.equal(result.status, "done");
  assert.deepEqual(executed, ["claude"]);
});

test("runTask: un ciclo de fix de código sin cambios no se da por bueno", async () => {
  const result = await runTask(
    task({ type: "coding" }),
    {
      baseRef: "base0",
      startRef: "prev1",
      execute: async () => "informe de cambios que no se aplican",
      workspace: fakeWorkspace(undefined),
      allowedAgents: [DEEPSEEK],
    },
  );

  assert.equal(result.status, "failed");
  assert.match(result.error ?? "", /no creó ni modificó ningún archivo/);
  assert.equal(result.resultCommit, undefined);
});

test("runTask: en un ciclo de fix, un agente que no cambia nada pasa al siguiente", async () => {
  const executed: string[] = [];
  let commits = 0;

  const workspace: WorkspaceManager = {
    ...fakeWorkspace(undefined),
    commit: async () => {
      commits += 1;
      return commits === 1 ? undefined : "fixed";
    },
  };

  const result = await runTask(task({ type: "coding", complexity: "medium" }), {
    baseRef: "base0",
    startRef: "prev1",
    execute: async (_prompt, agent) => {
      executed.push(agent.provider);
      return "texto";
    },
    workspace,
    allowedAgents: [CLAUDE_SONNET, CODEX],
  });

  assert.equal(result.status, "done");
  assert.equal(result.resultCommit, "squashed");
  assert.deepEqual(executed, ["claude", "codex"]);
});
