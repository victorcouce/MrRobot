import assert from "node:assert/strict";
import { test } from "node:test";
import type { Project } from "../projects/types.js";
import { superviseProject } from "./supervisor.js";

function makeProject(): Project {
  return {
    id: "p1",
    name: "p",
    goal: "objetivo",
    status: "running",
    baseRef: "base",
    tasks: [
      {
        id: "TASK-001",
        title: "a",
        description: "a",
        status: "failed",
        type: "coding",
        complexity: "low",
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

test("supervisor: continue", async () => {
  const decision = await superviseProject(makeProject(), {}, {
    execute: async () => JSON.stringify({ action: "continue", reason: "ok" }),
  });
  assert.equal(decision.action, "continue");
});

test("supervisor: replan con instrucciones", async () => {
  const decision = await superviseProject(makeProject(), {}, {
    execute: async () =>
      JSON.stringify({
        action: "replan",
        reason: "falta migración",
        instructions: "añade TASK-002",
      }),
  });

  assert.equal(decision.action, "replan");
  if (decision.action === "replan") {
    assert.equal(decision.instructions, "añade TASK-002");
  }
});

test("supervisor: pause", async () => {
  const decision = await superviseProject(makeProject(), {}, {
    execute: async () => JSON.stringify({ action: "pause", reason: "revisar" }),
  });
  assert.equal(decision.action, "pause");
});

test("supervisor: fail", async () => {
  const decision = await superviseProject(makeProject(), {}, {
    execute: async () => JSON.stringify({ action: "fail", reason: "imposible" }),
  });
  assert.equal(decision.action, "fail");
});

test("supervisor: respuesta inválida → continue defensivo", async () => {
  const decision = await superviseProject(makeProject(), {}, {
    execute: async () => "no soy json",
  });
  assert.equal(decision.action, "continue");
});
