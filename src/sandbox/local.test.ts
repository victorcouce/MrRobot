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

test("permite comandos git de solo lectura que usan los agentes", async () => {
  const remote = await sandbox.exec("git", ["remote", "-v"]);
  assert.equal(typeof remote.exitCode, "number");

  await sandbox.exec("git", ["ls-files"]);
  await sandbox.exec("git", ["rev-parse", "--is-inside-work-tree"]);
  await sandbox.exec("git", ["branch", "--show-current"]);
});

test("rechaza comandos fuera de la allowlist", async () => {
  await assert.rejects(
    () => sandbox.exec("git", ["remote", "add", "origin", "https://x"]),
    (error: unknown) => error instanceof SandboxViolationError,
  );
  await assert.rejects(
    () => sandbox.exec("rm", ["-rf", "."]),
    (error: unknown) => error instanceof SandboxViolationError,
  );
});
