import assert from "node:assert/strict";
import { test } from "node:test";
import { planProject } from "./planner.js";

const validPlan = {
  summary: "plan",
  tasks: [
    {
      id: "TASK-001",
      title: "base",
      description: "base",
      type: "coding",
      complexity: "low",
      dependsOn: [],
      acceptanceCriteria: ["compila"],
    },
    {
      id: "TASK-002",
      title: "ui",
      description: "ui",
      type: "coding",
      complexity: "medium",
      dependsOn: ["TASK-001"],
      acceptanceCriteria: [],
    },
  ],
};

test("planner: JSON válido devuelve el plan", async () => {
  const plan = await planProject("objetivo", {}, {
    execute: async () => JSON.stringify(validPlan),
    maxAttempts: 2,
  });

  assert.equal(plan.tasks.length, 2);
  assert.deepEqual(plan.tasks[1]?.dependsOn, ["TASK-001"]);
});

test("planner: JSON envuelto en markdown se parsea", async () => {
  const plan = await planProject("objetivo", {}, {
    execute: async () => "```json\n" + JSON.stringify(validPlan) + "\n```",
    maxAttempts: 1,
  });

  assert.equal(plan.tasks.length, 2);
});

test("planner: JSON inválido dispara reparación", async () => {
  let calls = 0;
  const plan = await planProject("objetivo", {}, {
    execute: async () => {
      calls += 1;
      return calls === 1 ? "no soy json" : JSON.stringify(validPlan);
    },
    maxAttempts: 2,
  });

  assert.equal(calls, 2);
  assert.equal(plan.tasks.length, 2);
});

test("planner: dependencia inexistente dispara reparación", async () => {
  let calls = 0;
  const plan = await planProject("objetivo", {}, {
    execute: async () => {
      calls += 1;
      if (calls === 1) {
        return JSON.stringify({
          summary: "s",
          tasks: [
            {
              id: "TASK-001",
              title: "a",
              description: "a",
              type: "coding",
              complexity: "low",
              dependsOn: ["TASK-999"],
              acceptanceCriteria: [],
            },
          ],
        });
      }
      return JSON.stringify(validPlan);
    },
    maxAttempts: 2,
  });

  assert.equal(calls, 2);
  assert.equal(plan.tasks.length, 2);
});

test("planner: un criterio de verificación manual dispara reparación", async () => {
  const manualPlan = {
    summary: "s",
    tasks: [
      {
        id: "TASK-001",
        title: "verificación",
        description: "verificar la app",
        type: "testing",
        complexity: "low",
        dependsOn: [],
        acceptanceCriteria: ["Comprobar manualmente que crear y borrar funciona"],
      },
    ],
  };

  let calls = 0;
  const plan = await planProject("objetivo", {}, {
    execute: async () => {
      calls += 1;
      return calls === 1
        ? JSON.stringify(manualPlan)
        : JSON.stringify(validPlan);
    },
    maxAttempts: 2,
  });

  assert.equal(calls, 2);
  assert.equal(plan.tasks.length, 2);
});

test("planner: un criterio con ruta absoluta dispara reparación", async () => {
  const absolutePlan = {
    summary: "s",
    tasks: [
      {
        id: "TASK-001",
        title: "archivo",
        description: "crear archivo",
        type: "coding",
        complexity: "low",
        dependsOn: [],
        acceptanceCriteria: [
          "existe /Users/victor/Developer/calc/package.json",
        ],
      },
    ],
  };

  let calls = 0;
  const plan = await planProject("objetivo", {}, {
    execute: async () => {
      calls += 1;
      return calls === 1
        ? JSON.stringify(absolutePlan)
        : JSON.stringify(validPlan);
    },
    maxAttempts: 2,
  });

  assert.equal(calls, 2);
  assert.equal(plan.tasks.length, 2);
});

test("planner: un plan solo con rutas absolutas agota intentos", async () => {
  const absolutePlan = {
    summary: "s",
    tasks: [
      {
        id: "TASK-001",
        title: "archivo",
        description: "crear archivo",
        type: "coding",
        complexity: "low",
        dependsOn: [],
        acceptanceCriteria: ["existe /Users/victor/Developer/calc/package.json"],
      },
    ],
  };

  let calls = 0;
  await assert.rejects(
    () =>
      planProject("objetivo", {}, {
        execute: async () => {
          calls += 1;
          return JSON.stringify(absolutePlan);
        },
        maxAttempts: 2,
      }),
    /rutas absolutas/,
  );

  assert.equal(calls, 2);
});

test("planner: un plan solo con verificación manual agota intentos", async () => {
  const manualPlan = {
    summary: "s",
    tasks: [
      {
        id: "TASK-001",
        title: "verificación",
        description: "verificar la app",
        type: "testing",
        complexity: "low",
        dependsOn: [],
        acceptanceCriteria: ["Revisar la consola del navegador en busca de errores"],
      },
    ],
  };

  let calls = 0;
  await assert.rejects(
    () =>
      planProject("objetivo", {}, {
        execute: async () => {
          calls += 1;
          return JSON.stringify(manualPlan);
        },
        maxAttempts: 2,
      }),
    /verificación manual/,
  );

  assert.equal(calls, 2);
});

test("planner: ciclo dispara reparación y puede agotar intentos", async () => {
  let calls = 0;
  const cyclic = {
    summary: "s",
    tasks: [
      {
        id: "TASK-001",
        title: "a",
        description: "a",
        type: "coding",
        complexity: "low",
        dependsOn: ["TASK-002"],
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
    ],
  };

  await assert.rejects(
    () =>
      planProject("objetivo", {}, {
        execute: async () => {
          calls += 1;
          return JSON.stringify(cyclic);
        },
        maxAttempts: 2,
      }),
    /no generó un plan válido/,
  );

  assert.equal(calls, 2);
});
