import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "../config/index.js";
import { InMemoryStorage } from "../storage/memory.js";
import { updateProjectConfig } from "./config-editor.js";
import type { ProjectDeps } from "./service.js";
import type { Project } from "./types.js";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "p1",
    name: "p",
    goal: "x",
    status: "ready",
    baseRef: "base0",
    tasks: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

async function setup(
  project: Project,
  config = loadConfig(),
): Promise<{ storage: InMemoryStorage; deps: ProjectDeps }> {
  const storage = new InMemoryStorage();
  await storage.init();
  await storage.saveProject(project);
  return { storage, deps: { storage, config } };
}

test("updateProjectConfig hereda del config global si el proyecto no tiene uno", async () => {
  const { storage, deps } = await setup(
    makeProject(),
    loadConfig({ concurrency: 5, plannerMaxAttempts: 7 }),
  );

  const updated = await updateProjectConfig(
    "p1",
    { maxReviewFixCycles: 5 },
    deps,
  );

  assert.equal(updated.config?.concurrency, 5);
  assert.equal(updated.config?.plannerMaxAttempts, 7);
  assert.equal(updated.config?.maxReviewFixCycles, 5);

  const reloaded = await storage.getProject("p1");
  assert.equal(reloaded?.config?.concurrency, 5);
  assert.equal(reloaded?.config?.maxReviewFixCycles, 5);

  const events = await storage.listEvents("p1");
  assert.ok(events.some((event) => event.type === "project.config_updated"));
});

test("updateProjectConfig parte del config propio del proyecto y conserva checks", async () => {
  const own = loadConfig({
    concurrency: 9,
    checks: { commands: ["npm run lint"] },
  });
  const { deps } = await setup(makeProject({ config: own }), loadConfig());

  const updated = await updateProjectConfig(
    "p1",
    { maxRetriesPerAgent: 3 },
    deps,
  );

  assert.equal(updated.config?.concurrency, 9);
  assert.deepEqual(updated.config?.checks.commands, ["npm run lint"]);
  assert.equal(updated.config?.maxRetriesPerAgent, 3);
});

test("updateProjectConfig rechaza estados no editables", async () => {
  const { deps } = await setup(makeProject({ status: "running" }));

  await assert.rejects(
    () => updateProjectConfig("p1", { concurrency: 4 }, deps),
    /No se puede editar la configuración/,
  );
});

test("updateProjectConfig falla si el proyecto no existe", async () => {
  const storage = new InMemoryStorage();
  await storage.init();

  await assert.rejects(
    () => updateProjectConfig("missing", { concurrency: 4 }, { storage }),
    /no encontrado/,
  );
});

test("updateProjectConfig: el modo se cambia también en proyectos terminados", async () => {
  const { deps } = await setup(makeProject({ status: "completed" }));

  const updated = await updateProjectConfig("p1", { fastMode: true, autoRun: true }, deps);
  assert.equal(updated.config?.fastMode, true);
  assert.equal(updated.config?.autoRun, true);

  await assert.rejects(
    updateProjectConfig("p1", { concurrency: 2 }, deps),
    /No se puede editar la configuración/,
  );
});

test("updateProjectConfig: el modo no se cambia mientras se ejecuta", async () => {
  const { deps } = await setup(makeProject({ status: "running" }));

  await assert.rejects(
    updateProjectConfig("p1", { autoRun: true }, deps),
    /No se puede editar la configuración/,
  );
});
