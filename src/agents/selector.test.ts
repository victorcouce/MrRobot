import assert from "node:assert/strict";
import { test } from "node:test";
import type { Task } from "../tasks/types.js";
import { resolveAgent, selectAgent } from "./selector.js";

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

test("coding + low -> deepseek flash", () => {
  assert.deepEqual(selectAgent(makeTask({ type: "coding", complexity: "low" })), {
    provider: "deepseek",
    model: "deepseek-flash",
  });
});

test("coding + medium -> claude sonnet", () => {
  assert.deepEqual(
    selectAgent(makeTask({ type: "coding", complexity: "medium" })),
    { provider: "claude", model: "sonnet" },
  );
});

test("coding + high -> codex", () => {
  assert.deepEqual(selectAgent(makeTask({ type: "coding", complexity: "high" })), {
    provider: "codex",
  });
});

test("coding + critical -> codex", () => {
  assert.deepEqual(
    selectAgent(makeTask({ type: "coding", complexity: "critical" })),
    { provider: "codex" },
  );
});

test("architecture + high -> claude opus", () => {
  assert.deepEqual(
    selectAgent(makeTask({ type: "architecture", complexity: "high" })),
    { provider: "claude", model: "opus" },
  );
});

test("planning + low -> claude sonnet", () => {
  assert.deepEqual(
    selectAgent(makeTask({ type: "planning", complexity: "low" })),
    { provider: "claude", model: "sonnet" },
  );
});

test("planning + critical -> claude opus", () => {
  assert.deepEqual(
    selectAgent(makeTask({ type: "planning", complexity: "critical" })),
    { provider: "claude", model: "opus" },
  );
});

test("review + critical -> claude opus", () => {
  assert.deepEqual(
    selectAgent(makeTask({ type: "review", complexity: "critical" })),
    { provider: "claude", model: "opus" },
  );
});

test("review + medium -> claude sonnet", () => {
  assert.deepEqual(
    selectAgent(makeTask({ type: "review", complexity: "medium" })),
    { provider: "claude", model: "sonnet" },
  );
});

test("testing + low -> deepseek flash", () => {
  assert.deepEqual(
    selectAgent(makeTask({ type: "testing", complexity: "low" })),
    { provider: "deepseek", model: "deepseek-flash" },
  );
});

test("testing + high -> claude sonnet", () => {
  assert.deepEqual(
    selectAgent(makeTask({ type: "testing", complexity: "high" })),
    { provider: "claude", model: "sonnet" },
  );
});

test("research + low -> deepseek flash", () => {
  assert.deepEqual(
    selectAgent(makeTask({ type: "research", complexity: "low" })),
    { provider: "deepseek", model: "deepseek-flash" },
  );
});

test("research + medium -> claude sonnet", () => {
  assert.deepEqual(
    selectAgent(makeTask({ type: "research", complexity: "medium" })),
    { provider: "claude", model: "sonnet" },
  );
});

test("research + high -> claude opus", () => {
  assert.deepEqual(
    selectAgent(makeTask({ type: "research", complexity: "high" })),
    { provider: "claude", model: "opus" },
  );
});

test("explicit agent has priority over auto-selection", () => {
  const task = makeTask({
    type: "coding",
    complexity: "low",
    agent: { provider: "claude", model: "opus" },
  });

  assert.deepEqual(selectAgent(task), {
    provider: "deepseek",
    model: "deepseek-flash",
  });
  assert.deepEqual(resolveAgent(task), { provider: "claude", model: "opus" });
});

test("no explicit agent falls back to auto-selection", () => {
  const task = makeTask({ type: "architecture", complexity: "low" });

  assert.deepEqual(resolveAgent(task), { provider: "claude", model: "opus" });
});
