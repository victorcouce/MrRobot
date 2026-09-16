import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Project } from "../projects/types.js";
import type { TaskWorkspace, WorkspaceManager } from "../workspace/types.js";
import {
  detectPackageManager,
  installCommand,
  parsePreviewUrl,
  pickPreviewScript,
  PreviewManager,
  runCommand,
} from "./preview.js";

test("pickPreviewScript prioriza dev, start, preview y serve", () => {
  assert.equal(pickPreviewScript({ scripts: { dev: "vite" } }), "dev");
  assert.equal(pickPreviewScript({ scripts: { start: "next start" } }), "start");
  assert.equal(pickPreviewScript({ scripts: { serve: "serve" } }), "serve");
  assert.equal(pickPreviewScript({ scripts: { build: "tsc" } }), undefined);
  assert.equal(pickPreviewScript({}), undefined);
});

test("parsePreviewUrl limpia códigos ANSI y barras finales", () => {
  const output = "\u001b[32m➜\u001b[0m  Local:   http://localhost:5173/";

  assert.equal(parsePreviewUrl(output), "http://localhost:5173");
  assert.equal(
    parsePreviewUrl("ready on http://127.0.0.1:3000"),
    "http://127.0.0.1:3000",
  );
  assert.equal(parsePreviewUrl("sin url"), undefined);
});

test("detectPackageManager usa packageManager y lockfiles", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mrrobot-preview-"));

  assert.equal(await detectPackageManager(dir, {}), "npm");

  await writeFile(join(dir, "pnpm-lock.yaml"), "lockfileVersion: 9\n");
  assert.equal(await detectPackageManager(dir, {}), "pnpm");

  assert.equal(
    await detectPackageManager(dir, { packageManager: "yarn@4.0.0" }),
    "yarn",
  );
});

test("installCommand y runCommand según el gestor", () => {
  assert.equal(installCommand("npm"), "npm install");
  assert.equal(installCommand("yarn"), "yarn install");
  assert.equal(installCommand("pnpm"), "pnpm install");

  assert.equal(runCommand("npm", "dev"), "npm run dev");
  assert.equal(runCommand("yarn", "dev"), "yarn dev");
  assert.equal(runCommand("pnpm", "dev"), "pnpm run dev");
});

function fakeWorkspace(dir: string): WorkspaceManager {
  return {
    getRepoRoot: async () => dir,
    resolveBaseRef: async () => "base0",
    isDirty: async () => false,
    create: async (taskId, attempt, baseRef): Promise<TaskWorkspace> => ({
      taskId,
      branchName: `agent/${taskId}-attempt-${attempt}`,
      path: dir,
      baseRef,
    }),
    commit: async () => undefined,
    remove: async () => {},
    diff: async () => "",
    integrateDependencies: async () => ({
      ok: true,
      ref: "base0",
      branchName: "base0",
    }),
    finalizeProject: async () => ({
      ok: true,
      ref: "final",
      branchName: "agent/project-final",
    }),
  };
}

function completedProject(dir: string): Project {
  return {
    id: "p1",
    name: "web",
    goal: "web",
    status: "completed",
    baseRef: "base0",
    repoPath: dir,
    tasks: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    resultBranch: "agent/project-p1-final",
    resultCommit: "final",
  };
}

test("preview falla con un mensaje claro si no hay package.json", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mrrobot-preview-"));
  const manager = new PreviewManager();

  const started = await manager.start(completedProject(dir), fakeWorkspace(dir));
  assert.equal(started.status, "starting");

  let status = manager.get("p1");
  for (let i = 0; i < 50 && status?.status !== "failed"; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    status = manager.get("p1");
  }

  assert.equal(status?.status, "failed");
  assert.match(status?.error ?? "", /package\.json/);
});

test("preview sirve un sitio estático con index.html", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mrrobot-static-"));
  await writeFile(join(dir, "index.html"), "<h1>Calculadora</h1>");
  await writeFile(join(dir, "app.js"), "console.log('ok')");

  const manager = new PreviewManager();
  await manager.start(completedProject(dir), fakeWorkspace(dir));

  let status = manager.get("p1");
  for (let i = 0; i < 50 && status?.status !== "running"; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    status = manager.get("p1");
  }

  assert.equal(status?.status, "running");
  assert.ok(status?.url);

  const html = await (await fetch(`${status.url}/`)).text();
  assert.match(html, /Calculadora/);

  const js = await fetch(`${status.url}/app.js`);
  assert.match(js.headers.get("content-type") ?? "", /javascript/);

  assert.equal((await manager.stop("p1"))?.status, "stopped");
});

test("preview no arranca si el proyecto no está completado", async () => {
  const manager = new PreviewManager();
  const project = { ...completedProject("."), status: "running" as const };

  await assert.rejects(
    () => manager.start(project, fakeWorkspace(".")),
    /completado/,
  );
});
