import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { checkFolder, checkRemote, expandPath } from "./validate.js";

const run = promisify(execFile);

async function git(args: string[], cwd: string): Promise<void> {
  await run("git", args, { cwd });
}

async function makeRepo(withCommit: boolean): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mrrobot-validate-"));
  await git(["init", "-b", "main"], dir);
  await git(["config", "user.email", "test@localhost"], dir);
  await git(["config", "user.name", "Test"], dir);

  if (withCommit) {
    await writeFile(join(dir, "README.md"), "# test\n");
    await git(["add", "."], dir);
    await git(["commit", "-m", "inicial"], dir);
  }

  return dir;
}

test("checkFolder detecta un repositorio git y su rama base", async () => {
  const dir = await makeRepo(true);

  try {
    const check = await checkFolder(dir);

    assert.equal(check.exists, true);
    assert.equal(check.isRepo, true);
    assert.equal(check.branch, "main");
    assert.equal(check.dirty, false);
    assert.ok(check.root);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("checkFolder marca los cambios sin commitear", async () => {
  const dir = await makeRepo(true);

  try {
    await writeFile(join(dir, "suelto.txt"), "x");
    const check = await checkFolder(dir);

    assert.equal(check.dirty, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("checkFolder no devuelve rama en un repo sin commits", async () => {
  const dir = await makeRepo(false);

  try {
    const check = await checkFolder(dir);

    assert.equal(check.isRepo, true);
    assert.equal(check.branch, undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("checkFolder distingue carpeta normal, creable e imposible", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mrrobot-validate-"));

  try {
    const plain = await checkFolder(dir);
    assert.equal(plain.exists, true);
    assert.equal(plain.isRepo, false);
    assert.equal(plain.error, undefined);

    const nueva = await checkFolder(join(dir, "proyecto-nuevo"));
    assert.equal(nueva.exists, false);
    assert.equal(nueva.creatable, true);
    assert.equal(nueva.error, undefined);

    const imposible = await checkFolder(join(dir, "no", "existe", "nada"));
    assert.equal(imposible.exists, false);
    assert.equal(imposible.creatable, false);
    assert.ok(imposible.error);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("expandPath resuelve ~ y las rutas relativas", () => {
  assert.ok(expandPath("~/proyectos").startsWith("/"));
  assert.ok(expandPath("./algo").startsWith("/"));
  assert.equal(expandPath("  /tmp/x  "), "/tmp/x");
});

test("checkRemote pide GITHUB_TOKEN para un remoto de GitHub", async () => {
  const previous = process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;

  try {
    const check = await checkRemote("https://github.com/acme/demo.git");

    assert.equal(check.checked, false);
    assert.equal(check.needsToken, true);
    assert.match(check.error ?? "", /GITHUB_TOKEN/);
  } finally {
    if (previous !== undefined) process.env.GITHUB_TOKEN = previous;
  }
});

test("checkRemote verifica un remoto local", async () => {
  const origin = await makeRepo(true);

  try {
    const ok = await checkRemote(origin);
    assert.equal(ok.checked, true);
    assert.equal(ok.ok, true);

    const missing = await checkRemote(join(origin, "no-existe"));
    assert.equal(missing.checked, true);
    assert.equal(missing.ok, false);
    assert.ok(missing.error);
  } finally {
    await rm(origin, { recursive: true, force: true });
  }
});
