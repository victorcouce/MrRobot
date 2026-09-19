import assert from "node:assert/strict";
import { test } from "node:test";
import { runTask } from "../tasks/runner.js";
import type { Task, TaskComplexity, TaskType } from "../tasks/types.js";
import type { WorkspaceManager } from "../workspace/types.js";
import {
  getFallbackChain,
  isRetryableError,
  MAX_RETRIES_PER_AGENT,
} from "./fallback.js";
import { selectAgent } from "./selector.js";
import type { AgentCandidate } from "./types.js";

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: "T-TEST",
    title: "tarea de prueba",
    description: "descripción de prueba",
    status: "ready",
    type: "coding",
    complexity: "low",
    ...overrides,
  };
}

function keyOf(agent: AgentCandidate): string {
  return agent.provider === "codex"
    ? "codex"
    : `${agent.provider}:${agent.model}`;
}

function fakeWorkspace(): WorkspaceManager {
  let commits = 0;

  return {
    getRepoRoot: async () => "/fake/repo",
    resolveBaseRef: async () => "fakesha",
    isDirty: async () => false,
    create: async (taskId, attempt, baseRef) => ({
      taskId,
      branchName: `agent/${taskId}-attempt-${attempt}`,
      path: `/fake/repo/.worktrees/${taskId}-attempt-${attempt}`,
      baseRef,
    }),
    commit: async () => {
      commits += 1;
      return `fakecommit-${commits}`;
    },
    squash: async () => {
      commits += 1;
      return `fakecommit-${commits}`;
    },
    remove: async () => {},
    diff: async () => "",
    integrateDependencies: async (_taskId, _commits, baseRef) => ({
      ok: true,
      ref: baseRef,
      branchName: "integration/fake",
    }),
    finalizeProject: async (_projectId, _commits, baseRef) => ({
      ok: true,
      ref: baseRef,
      branchName: "agent/project-fake-final",
    }),
  };
}

const TASK_TYPES: TaskType[] = [
  "planning",
  "architecture",
  "coding",
  "review",
  "testing",
  "research",
];

const COMPLEXITIES: TaskComplexity[] = ["low", "medium", "high", "critical"];

test("el primer candidato coincide con selectAgent en todas las combinaciones", () => {
  for (const type of TASK_TYPES) {
    for (const complexity of COMPLEXITIES) {
      const task = makeTask({ type, complexity });
      assert.deepEqual(getFallbackChain(task)[0], selectAgent(task));
    }
  }
});

test("coding low -> deepseek flash, sonnet, codex", () => {
  assert.deepEqual(
    getFallbackChain(makeTask({ type: "coding", complexity: "low" })),
    [
      { provider: "deepseek", model: "deepseek-flash" },
      { provider: "claude", model: "sonnet" },
      { provider: "codex" },
    ],
  );
});

test("coding high -> codex, sonnet, opus", () => {
  assert.deepEqual(
    getFallbackChain(makeTask({ type: "coding", complexity: "high" })),
    [
      { provider: "codex" },
      { provider: "claude", model: "sonnet" },
      { provider: "claude", model: "opus" },
    ],
  );
});

test("research medium -> sonnet, deepseek flash, opus", () => {
  assert.deepEqual(
    getFallbackChain(makeTask({ type: "research", complexity: "medium" })),
    [
      { provider: "claude", model: "sonnet" },
      { provider: "deepseek", model: "deepseek-flash" },
      { provider: "claude", model: "opus" },
    ],
  );
});

test("el agente explícito va primero y no elimina los fallbacks", () => {
  const chain = getFallbackChain(
    makeTask({
      type: "coding",
      complexity: "medium",
      agent: { provider: "claude", model: "opus" },
    }),
  );

  assert.deepEqual(chain[0], { provider: "claude", model: "opus" });
  assert.equal(chain.length, 4);
});

test("no hay candidatos duplicados en la cadena", () => {
  const chain = getFallbackChain(
    makeTask({
      type: "coding",
      complexity: "medium",
      agent: { provider: "claude", model: "sonnet" },
    }),
  );

  const keys = chain.map(keyOf);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(chain, [
    { provider: "claude", model: "sonnet" },
    { provider: "codex" },
    { provider: "deepseek", model: "deepseek-flash" },
  ]);
});

test("los agentes permitidos del chat filtran la cadena", () => {
  const chain = getFallbackChain(
    makeTask({ type: "coding", complexity: "high" }),
    [
      { provider: "claude", model: "sonnet" },
      { provider: "codex" },
    ],
  );

  // Conserva el orden automático (codex antes que sonnet en coding high) y
  // descarta opus, que el chat no permite.
  assert.deepEqual(chain, [
    { provider: "codex" },
    { provider: "claude", model: "sonnet" },
  ]);
});

test("un permitido fuera de la cadena automática se añade al final", () => {
  const chain = getFallbackChain(
    makeTask({ type: "coding", complexity: "low" }),
    [{ provider: "deepseek", model: "deepseek-v4-pro" }],
  );

  assert.deepEqual(chain, [{ provider: "deepseek", model: "deepseek-v4-pro" }]);
});

test("el agente explícito de la tarea también se filtra", () => {
  const chain = getFallbackChain(
    makeTask({
      type: "coding",
      complexity: "medium",
      agent: { provider: "claude", model: "opus" },
    }),
    [{ provider: "codex" }],
  );

  assert.deepEqual(chain, [{ provider: "codex" }]);
});

test("una lista vacía de permitidos no restringe nada", () => {
  const task = makeTask({ type: "coding", complexity: "high" });
  assert.deepEqual(getFallbackChain(task, []), getFallbackChain(task));
});

test("runTask solo ejecuta agentes permitidos", async () => {
  const used: AgentCandidate[] = [];
  const execute = async (
    _prompt: string,
    agent: AgentCandidate,
  ): Promise<string> => {
    used.push(agent);
    throw new Error("503 service unavailable");
  };

  const result = await runTask(
    makeTask({ type: "coding", complexity: "high" }),
    {
      execute,
      workspace: fakeWorkspace(),
      allowedAgents: [{ provider: "deepseek", model: "deepseek-flash" }],
    },
  );

  assert.equal(result.status, "failed");
  assert.ok(used.length > 0);
  assert.ok(
    used.every(
      (agent) =>
        agent.provider === "deepseek" && agent.model === "deepseek-flash",
    ),
    `se usaron agentes no permitidos: ${used.map(keyOf).join(", ")}`,
  );
});

test("isRetryableError clasifica errores temporales como reintentables", () => {
  assert.equal(isRetryableError(new Error("HTTP 429 Too Many Requests")), true);
  assert.equal(isRetryableError(new Error("ETIMEDOUT")), true);
  assert.equal(isRetryableError(new Error("Service Unavailable")), true);
  assert.equal(isRetryableError(new Error("socket hang up")), true);
});

test("isRetryableError clasifica errores permanentes como no reintentables", () => {
  assert.equal(isRetryableError(new Error("falta DEEPSEEK_API_KEY")), false);
  assert.equal(isRetryableError(new Error("spawn codex ENOENT")), false);
  assert.equal(isRetryableError(new Error("invalid model")), false);
  assert.equal(
    isRetryableError(new Error("You've hit your session limit")),
    false,
  );
});

test("Caso 1: Codex success -> 1 intento, DONE, executedBy Codex", async () => {
  const calls: AgentCandidate[] = [];
  const execute = async (
    _prompt: string,
    agent: AgentCandidate,
  ): Promise<string> => {
    calls.push(agent);
    return "ok";
  };

  const result = await runTask(
    makeTask({ type: "coding", complexity: "high" }),
    { execute, workspace: fakeWorkspace() },
  );

  assert.equal(result.status, "done");
  assert.deepEqual(result.executedBy, { provider: "codex" });
  assert.equal(result.attempts?.length, 1);
  assert.equal(result.attempts?.[0]?.status, "success");
  assert.equal(calls.length, 1);
});

test("Caso 2: codex sin cuota, se pasa a sonnet -> 2 intentos", async () => {
  const execute = async (
    _prompt: string,
    agent: AgentCandidate,
  ): Promise<string> => {
    if (agent.provider === "codex") {
      throw new Error("429 rate limit");
    }
    return "ok";
  };

  const result = await runTask(
    makeTask({ type: "coding", complexity: "high" }),
    { execute, workspace: fakeWorkspace() },
  );

  assert.equal(result.status, "done");
  assert.deepEqual(result.executedBy, { provider: "claude", model: "sonnet" });
  assert.equal(result.attempts?.length, 2);
  assert.deepEqual(
    result.attempts?.map((attempt) => attempt.status),
    ["failed", "success"],
  );
  assert.deepEqual(
    result.attempts?.map((attempt) => attempt.agent),
    [{ provider: "codex" }, { provider: "claude", model: "sonnet" }],
  );
});

test("runTask: si todos caen por límite, espera y reintenta la cadena", async () => {
  const used: AgentCandidate[] = [];
  const execute = async (
    _prompt: string,
    agent: AgentCandidate,
  ): Promise<string> => {
    used.push(agent);
    if (used.length <= 3) {
      throw new Error("429 rate limit");
    }
    return "ok";
  };

  const result = await runTask(
    makeTask({ type: "coding", complexity: "high" }),
    {
      execute,
      workspace: fakeWorkspace(),
      limitRetry: { maxLimitRetries: 1, baseDelayMs: 0, maxDelayMs: 0 },
    },
  );

  assert.equal(result.status, "done");
  // Cadena high = [codex, sonnet, opus]: recorrido completo + reintento.
  assert.equal(used.length, 4);
  assert.equal(result.attempts?.length, 4);
});

test("Caso 3: todos fallan -> FAILED con historial completo", async () => {
  const execute = async (): Promise<string> => {
    throw new Error("503 service unavailable");
  };

  const result = await runTask(
    makeTask({ type: "coding", complexity: "high" }),
    { execute, workspace: fakeWorkspace() },
  );

  assert.equal(result.status, "failed");
  assert.equal(
    result.attempts?.length,
    3 * (MAX_RETRIES_PER_AGENT + 1),
  );
  assert.ok(result.attempts?.every((attempt) => attempt.status === "failed"));
  assert.equal(result.executedBy, undefined);
  assert.ok(result.error);
});

test("Caso 4: error no reintentable pasa al fallback sin repetir", async () => {
  const execute = async (
    _prompt: string,
    agent: AgentCandidate,
  ): Promise<string> => {
    if (agent.provider === "codex") {
      throw new Error("spawn codex ENOENT");
    }
    return "ok";
  };

  const result = await runTask(
    makeTask({ type: "coding", complexity: "high" }),
    { execute, workspace: fakeWorkspace() },
  );

  assert.equal(result.status, "done");
  assert.deepEqual(result.executedBy, { provider: "claude", model: "sonnet" });
  assert.equal(result.attempts?.length, 2);
  assert.deepEqual(
    result.attempts?.map((attempt) => attempt.status),
    ["failed", "success"],
  );
  assert.equal(result.attempts?.[0]?.attempt, 1);
});

test("Caso 5: la cadena con agente explícito no tiene duplicados", () => {
  const chain = getFallbackChain(
    makeTask({
      type: "review",
      complexity: "critical",
      agent: { provider: "claude", model: "opus" },
    }),
  );

  const keys = chain.map(keyOf);
  assert.equal(new Set(keys).size, keys.length);
});

test("onWorkspaceSuccess corre en el worktree del intento exitoso", async () => {
  const seen: string[] = [];

  const result = await runTask(
    makeTask({ type: "coding", complexity: "high" }),
    {
      execute: async () => "ok",
      workspace: fakeWorkspace(),
      onWorkspaceSuccess: async (workspace) => {
        seen.push(workspace.path);
      },
    },
  );

  assert.equal(result.status, "done");
  assert.equal(seen.length, 1);
  assert.match(seen[0] ?? "", /\.worktrees\//);
});

test("onWorkspaceSuccess no se llama si la tarea falla", async () => {
  let called = false;

  const result = await runTask(
    makeTask({ type: "coding", complexity: "high" }),
    {
      execute: async () => {
        throw new Error("spawn codex ENOENT");
      },
      workspace: fakeWorkspace(),
      onWorkspaceSuccess: async () => {
        called = true;
      },
    },
  );

  assert.equal(result.status, "failed");
  assert.equal(called, false);
});
