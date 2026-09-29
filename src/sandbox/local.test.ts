import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { DEFAULT_SANDBOX_POLICY, LocalSandbox } from "./local.js";
import { SandboxViolationError } from "./types.js";

let root: string;
let sandbox: LocalSandbox;

before(() => {
  root = mkdtempSync(join(tmpdir(), "sandbox-test-"));
  sandbox = new LocalSandbox(root, DEFAULT_SANDBOX_POLICY);
});

after(async () => {
  await sandbox.dispose();
  rmSync(root, { recursive: true, force: true });
});

test("permite usar git dentro del sandbox", async () => {
  const remote = await sandbox.exec("git", ["remote", "-v"]);
  assert.equal(typeof remote.exitCode, "number");

  await sandbox.exec("git", ["ls-files"]);
  await sandbox.exec("git", ["rev-parse", "--is-inside-work-tree"]);
  await sandbox.exec("git", ["branch", "--show-current"]);
  await sandbox.exec("git", ["checkout", "-b", "feature"]);
  await sandbox.exec("git", ["stash", "list"]);
});

test("permite utilidades de shell para inspeccionar el worktree", async () => {
  await sandbox.exec("ls", ["-la"]);
  await sandbox.exec("pwd");
  await sandbox.exec("mkdir", ["-p", "src"]);
  await sandbox.exec("grep", ["-r", "foo", "."]);
  await sandbox.exec("npm", ["ls"]);
});

test("veta las operaciones de red y de configuración de git", async () => {
  await assert.rejects(
    () => sandbox.exec("git", ["push", "origin", "main"]),
    (error: unknown) => error instanceof SandboxViolationError,
  );
  await assert.rejects(
    () => sandbox.exec("git", ["remote", "add", "origin", "https://x"]),
    (error: unknown) => error instanceof SandboxViolationError,
  );
  await assert.rejects(
    () => sandbox.exec("git", ["config", "--global", "user.email", "x@y"]),
    (error: unknown) => error instanceof SandboxViolationError,
  );
});

test("rechaza comandos fuera de la allowlist", async () => {
  await assert.rejects(
    () => sandbox.exec("rm", ["-rf", "."]),
    (error: unknown) => error instanceof SandboxViolationError,
  );
});

test("resuelve rutas relativas contra la raíz del worktree", async () => {
  await sandbox.write("styles.css", "body { color: red; }");
  assert.equal(
    (await sandbox.read("styles.css")).content,
    "body { color: red; }",
  );

  await sandbox.exec("mkdir", ["-p", "src"]);
  await sandbox.write("src/app.js", "console.log(1);");
  assert.equal((await sandbox.read("src/app.js")).content, "console.log(1);");

  // Los directorios intermedios se crean solos.
  await sandbox.write("lib/util.js", "export {};");
  assert.equal((await sandbox.read("lib/util.js")).content, "export {};");
});

test("rechaza rutas que escapan de la raíz", async () => {
  await assert.rejects(
    () => sandbox.read("../outside.txt"),
    (error: unknown) => error instanceof SandboxViolationError,
  );
  await assert.rejects(
    () => sandbox.read("/etc/hosts"),
    (error: unknown) => error instanceof SandboxViolationError,
  );
});
