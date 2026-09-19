import assert from "node:assert/strict";
import { test } from "node:test";
import type { Task } from "../tasks/types.js";
import {
  buildAgentMatrix,
  isAgentAllowed,
  resolveAgent,
  selectAgent,
  TASK_COMPLEXITIES,
  TASK_TYPES,
} from "./selector.js";

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

test("coding + low -> claude haiku", () => {
  assert.deepEqual(selectAgent(makeTask({ type: "coding", complexity: "low" })), {
    provider: "claude",
    model: "haiku",
  });
});

test("coding + medium -> claude haiku", () => {
  assert.deepEqual(
    selectAgent(makeTask({ type: "coding", complexity: "medium" })),
    { provider: "claude", model: "haiku" },
  );
});

test("coding + high -> claude haiku", () => {
  assert.deepEqual(selectAgent(makeTask({ type: "coding", complexity: "high" })), {
    provider: "claude",
    model: "haiku",
  });
});

test("coding + critical -> claude haiku", () => {
  assert.deepEqual(
    selectAgent(makeTask({ type: "coding", complexity: "critical" })),
    { provider: "claude", model: "haiku" },
  );
});

test("architecture + high -> claude opus", () => {
  assert.deepEqual(
    selectAgent(makeTask({ type: "architecture", complexity: "high" })),
    { provider: "claude", model: "opus" },
  );
});

test("planning + low -> claude opus", () => {
  assert.deepEqual(
    selectAgent(makeTask({ type: "planning", complexity: "low" })),
    { provider: "claude", model: "opus" },
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

test("testing + low -> claude haiku", () => {
  assert.deepEqual(
    selectAgent(makeTask({ type: "testing", complexity: "low" })),
    { provider: "claude", model: "haiku" },
  );
});

test("testing + high -> claude haiku", () => {
  assert.deepEqual(
    selectAgent(makeTask({ type: "testing", complexity: "high" })),
    { provider: "claude", model: "haiku" },
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
    provider: "claude",
    model: "haiku",
  });
  assert.deepEqual(resolveAgent(task), { provider: "claude", model: "opus" });
});

test("no explicit agent falls back to auto-selection", () => {
  const task = makeTask({ type: "architecture", complexity: "low" });

  assert.deepEqual(resolveAgent(task), { provider: "claude", model: "opus" });
});

test("selectAgent respeta los agentes permitidos del chat", () => {
  const task = makeTask({ type: "coding", complexity: "low" });

  // El automático sería haiku; el chat solo permite codex.
  assert.deepEqual(selectAgent(task, [{ provider: "codex" }]), {
    provider: "codex",
  });

  // Si el automático está permitido, se mantiene.
  assert.deepEqual(
    selectAgent(task, [
      { provider: "codex" },
      { provider: "claude", model: "haiku" },
    ]),
    { provider: "claude", model: "haiku" },
  );
});

test("resolveAgent descarta el agente explícito si el chat no lo permite", () => {
  const task = makeTask({
    type: "coding",
    complexity: "low",
    agent: { provider: "claude", model: "opus" },
  });

  assert.deepEqual(resolveAgent(task, [{ provider: "codex" }]), {
    provider: "codex",
  });
  assert.deepEqual(resolveAgent(task), { provider: "claude", model: "opus" });
});

test("buildAgentMatrix coincide con selectAgent en todas las combinaciones", () => {
  const matrix = buildAgentMatrix();
  assert.equal(matrix.length, TASK_TYPES.length);

  for (const row of matrix) {
    for (const complexity of TASK_COMPLEXITIES) {
      const task = makeTask({ type: row.type, complexity });
      assert.deepEqual(
        row.agents[complexity],
        selectAgent(task),
        `${row.type} × ${complexity} desincronizado con selectAgent`,
      );
    }
  }
});

test("isAgentAllowed iguala el modelo por defecto de cada proveedor", () => {
  assert.equal(
    isAgentAllowed({ provider: "claude" }, [
      { provider: "claude", model: "sonnet" },
    ]),
    true,
  );
  assert.equal(
    isAgentAllowed({ provider: "claude", model: "opus" }, [
      { provider: "claude", model: "sonnet" },
    ]),
    false,
  );
  assert.equal(isAgentAllowed({ provider: "codex" }, []), true);
});
