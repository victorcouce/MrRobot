import assert from "node:assert/strict";
import { test } from "node:test";
import { AgentHealth } from "./health.js";
import { roleFallbackChain, runRoleAgent } from "./role.js";
import {
  CLAUDE_OPUS,
  CODEX,
  DEEPSEEK_FLASH,
} from "./selector.js";
import type { AgentCandidate } from "./types.js";

test("roleFallbackChain: reviewer high empieza por Opus", () => {
  const chain = roleFallbackChain("reviewer", [], "high");
  assert.deepEqual(chain[0], CLAUDE_OPUS);
});

test("roleFallbackChain: se restringe a los agentes permitidos", () => {
  const chain = roleFallbackChain("reviewer", [DEEPSEEK_FLASH], "high");
  assert.deepEqual(chain, [DEEPSEEK_FLASH]);
});

test("roleFallbackChain: un agente preferido va primero", () => {
  const chain = roleFallbackChain("planner", [], "low", CLAUDE_OPUS);
  assert.deepEqual(chain[0], CLAUDE_OPUS);
});

test("runRoleAgent: usa el agente elegido por complejidad", async () => {
  const calls: AgentCandidate[] = [];
  const output = await runRoleAgent("p", "reviewer", {
    complexity: "high",
    execute: async (_prompt, agent) => {
      calls.push(agent);
      return "ok";
    },
  });

  assert.equal(output, "ok");
  assert.deepEqual(calls, [CLAUDE_OPUS]);
});

test("runRoleAgent: proveedor sin cuota salta al siguiente sin reintentar", async () => {
  const calls: AgentCandidate[] = [];
  const output = await runRoleAgent("p", "reviewer", {
    complexity: "high",
    execute: async (_prompt, agent) => {
      calls.push(agent);
      if (agent.provider === "claude" && agent.model === "opus") {
        throw new Error("429 rate limit");
      }
      return "ok";
    },
  });

  assert.equal(output, "ok");
  assert.deepEqual(calls, [CLAUDE_OPUS, CODEX]);
});

test("runRoleAgent: error transitorio reintenta el mismo agente", async () => {
  const calls: AgentCandidate[] = [];
  const output = await runRoleAgent("p", "reviewer", {
    complexity: "high",
    execute: async (_prompt, agent) => {
      calls.push(agent);
      if (calls.length === 1) {
        throw new Error("503 service unavailable");
      }
      return "ok";
    },
  });

  assert.equal(output, "ok");
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], CLAUDE_OPUS);
  assert.deepEqual(calls[1], CLAUDE_OPUS);
});

test("runRoleAgent: si todos caen por límite, espera y reintenta la cadena", async () => {
  const calls: AgentCandidate[] = [];
  const output = await runRoleAgent("p", "reviewer", {
    complexity: "high",
    limitRetry: { maxLimitRetries: 1, baseDelayMs: 0, maxDelayMs: 0 },
    execute: async (_prompt, agent) => {
      calls.push(agent);
      if (calls.length <= 3) {
        throw new Error("429 rate limit");
      }
      return "ok";
    },
  });

  assert.equal(output, "ok");
  // Cadena high = [opus, codex, sonnet]: un recorrido completo + el reintento.
  assert.equal(calls.length, 4);
  assert.deepEqual(calls[3], CLAUDE_OPUS);
});

test("runRoleAgent: un fallo transitorio no dispara el reintento de cadena", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      runRoleAgent("p", "reviewer", {
        complexity: "high",
        limitRetry: { maxLimitRetries: 5, baseDelayMs: 0, maxDelayMs: 0 },
        execute: async () => {
          calls += 1;
          throw new Error("503 service unavailable");
        },
      }),
    /Ningún agente pudo completar el rol "reviewer"/,
  );

  // 3 candidatos x (1 intento + 1 retry) sin re-recorrer la cadena.
  assert.equal(calls, 6);
});

test("runRoleAgent: si todos fallan lanza", async () => {
  await assert.rejects(
    () =>
      runRoleAgent("p", "reviewer", {
        complexity: "high",
        execute: async () => {
          throw new Error("503 service unavailable");
        },
      }),
    /Ningún agente pudo completar el rol "reviewer"/,
  );
});

test("runRoleAgent: un agente agotado pasa al final en la siguiente llamada", async () => {
  const health = new AgentHealth({ now: () => 0 });
  const first: AgentCandidate[] = [];

  const output = await runRoleAgent("p", "reviewer", {
    complexity: "high",
    agentHealth: health,
    execute: async (_prompt, agent) => {
      first.push(agent);

      if (agent.provider === "claude" && agent.model === "opus") {
        throw new Error("429 rate limit");
      }

      return "ok";
    },
  });

  assert.equal(output, "ok");
  assert.deepEqual(first, [CLAUDE_OPUS, CODEX]);

  // La cuarentena de Opus hace que la siguiente llamada empiece por Codex.
  const second: AgentCandidate[] = [];
  const again = await runRoleAgent("p", "reviewer", {
    complexity: "high",
    agentHealth: health,
    execute: async (_prompt, agent) => {
      second.push(agent);
      return "ok";
    },
  });

  assert.equal(again, "ok");
  assert.deepEqual(second, [CODEX]);
});

test("roleFallbackChain: reviewer low empieza por Haiku y medium por Sonnet", () => {
  assert.deepEqual(roleFallbackChain("reviewer", [], "low")[0], {
    provider: "claude",
    model: "haiku",
  });
  assert.deepEqual(roleFallbackChain("reviewer", [], "medium")[0], {
    provider: "claude",
    model: "sonnet",
  });
});
