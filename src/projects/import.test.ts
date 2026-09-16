import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { InMemoryStorage } from "../storage/memory.js";
import { importCompletedProject, listFinalBranches } from "./import.js";

function git(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      { cwd, encoding: "utf8" },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message));
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}

const BRANCH = "agent/project-proj-123-final";

async function createFinalRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mrrobot-import-"));

  await git(["init", "-b", "main"], dir);
  await git(["config", "user.email", "test@example.com"], dir);
  await git(["config", "user.name", "Test"], dir);
  await writeFile(join(dir, "README.md"), "# base\n", "utf8");
  await git(["add", "-A"], dir);
  await git(["commit", "-m", "chore: initial commit"], dir);

  await git(["checkout", "-b", BRANCH], dir);

  await writeFile(join(dir, "index.html"), "<h1>app</h1>", "utf8");
  await git(["add", "-A"], dir);
  await git(["commit", "-m", "agent(TASK-001): Scaffold"], dir);

  await writeFile(join(dir, "app.js"), "console.log('ok')", "utf8");
  await git(["add", "-A"], dir);
  await git(["commit", "-m", "agent(TASK-002): Implementar sum"], dir);

  return realpath(dir);
}

test("listFinalBranches lista las ramas finales", async () => {
  const dir = await createFinalRepo();
  assert.deepEqual(await listFinalBranches(dir), [BRANCH]);
});

test("importCompletedProject reconstruye un proyecto completado", async () => {
  const dir = await createFinalRepo();
  const storage = new InMemoryStorage();
  await storage.init();

  const project = await importCompletedProject({ repoPath: dir }, { storage });

  assert.equal(project.id, "proj-123");
  assert.equal(project.status, "completed");
  assert.equal(project.repoPath, dir);
  assert.equal(project.resultBranch, BRANCH);
  assert.ok(project.resultCommit);
  assert.deepEqual(
    project.tasks.map((task) => [task.id, task.status]),
    [
      ["TASK-001", "done"],
      ["TASK-002", "done"],
    ],
  );
  assert.ok(project.tasks.every((task) => task.resultCommit));

  const stored = await storage.getProject("proj-123");
  assert.equal(stored?.status, "completed");

  const events = await storage.listEvents("proj-123");
  const types = events.map((event) => event.type);
  assert.ok(types.includes("project.completed"));
  assert.equal(
    events.filter((event) => event.type === "task.completed").length,
    2,
  );

  await assert.rejects(
    () => importCompletedProject({ repoPath: dir }, { storage }),
    /Ya existe/,
  );
});

test("importCompletedProject acepta nombre y rama explícita", async () => {
  const dir = await createFinalRepo();
  const storage = new InMemoryStorage();
  await storage.init();

  const project = await importCompletedProject(
    { repoPath: dir, branch: BRANCH, name: "Calculadora" },
    { storage },
  );

  assert.equal(project.name, "Calculadora");
});
