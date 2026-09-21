import assert from "node:assert/strict";
import { test } from "node:test";
import { InMemoryStorage } from "../storage/memory.js";
import { updateTaskInPlan } from "./plan-editor.js";
import type { ProjectDeps } from "./service.js";
import type { Project } from "./types.js";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "p1",
    name: "p",
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
    ...overrides,
  };
}

async function setup(project: Project): Promise<ProjectDeps> {
  const storage = new InMemoryStorage();
  await storage.init();
  await storage.saveProject(project);
  return { storage };
}

test("updateTaskInPlan permite añadir dependencias con el proyecto en pausa", async () => {
  const deps = await setup(makeProject());

  const updated = await updateTaskInPlan(
    "p1",
    "TASK-005A",
    { dependsOn: ["TASK-001"] },
    deps,
  );

  const task = updated.tasks.find((entry) => entry.id === "TASK-005A");
  assert.deepEqual(task?.dependsOn, ["TASK-001"]);
});

test("updateTaskInPlan rechaza editar mientras el proyecto está en ejecución", async () => {
  const deps = await setup(makeProject({ status: "running" }));

  await assert.rejects(
    () => updateTaskInPlan("p1", "TASK-005A", { dependsOn: [] }, deps),
    /no es editable/,
  );
});

test("updateTaskInPlan rechaza dependencias inexistentes", async () => {
  const deps = await setup(makeProject());

  await assert.rejects(
    () =>
      updateTaskInPlan("p1", "TASK-005A", { dependsOn: ["TASK-999"] }, deps),
    /dependencias inexistentes/,
  );
});
