import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { promisify } from "node:util";
import {
  dependencyKey,
  installEnv,
  primeDependencies,
  saveDependencies,
} from "./deps-store.js";

let store: string;
let previousStore: string | undefined;

before(async () => {
  store = await mkdtemp(join(tmpdir(), "mrrobot-deps-store-"));
  previousStore = process.env.MRROBOT_DEPS_CACHE;
  process.env.MRROBOT_DEPS_CACHE = store;
});

after(async () => {
  if (previousStore === undefined) {
    delete process.env.MRROBOT_DEPS_CACHE;
  } else {
    process.env.MRROBOT_DEPS_CACHE = previousStore;
  }

  await rm(store, { recursive: true, force: true });
});

async function makeProject(
  files: Record<string, string>,
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mrrobot-wt-"));

  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(dir, name), content, "utf8");
  }

  return dir;
}

const PACKAGE_JSON = JSON.stringify({
  name: "demo",
  version: "1.0.0",
  dependencies: { left_pad: "1.0.0" },
});

test("dependencyKey es estable para el mismo lockfile", async () => {
  const a = await makeProject({
    "package.json": PACKAGE_JSON,
    "package-lock.json": '{"lockfileVersion":3}',
  });
  const b = await makeProject({
    // Distinto nombre y scripts, mismo árbol de dependencias.
    "package.json": JSON.stringify({
      name: "otro",
      version: "9.9.9",
      scripts: { build: "tsc" },
      dependencies: { left_pad: "1.0.0" },
    }),
    "package-lock.json": '{"lockfileVersion":3}',
  });

  assert.equal(await dependencyKey(a), await dependencyKey(b));

  await rm(a, { recursive: true, force: true });
  await rm(b, { recursive: true, force: true });
});

test("dependencyKey cambia si cambia el lockfile", async () => {
  const a = await makeProject({
    "package.json": PACKAGE_JSON,
    "package-lock.json": '{"lockfileVersion":3,"packages":{"a":1}}',
  });
  const b = await makeProject({
    "package.json": PACKAGE_JSON,
    "package-lock.json": '{"lockfileVersion":3,"packages":{"a":2}}',
  });

  assert.notEqual(await dependencyKey(a), await dependencyKey(b));

  await rm(a, { recursive: true, force: true });
  await rm(b, { recursive: true, force: true });
});

test("dependencyKey ignora un directorio sin package.json", async () => {
  const dir = await makeProject({});
  assert.equal(await dependencyKey(dir), undefined);
  await rm(dir, { recursive: true, force: true });
});

test("un worktree siembra sus dependencias desde el almacén", async () => {
  const source = await makeProject({
    "package.json": PACKAGE_JSON,
    "package-lock.json": '{"lockfileVersion":3,"packages":{"seed":1}}',
  });

  await mkdir(join(source, "node_modules", "left_pad"), { recursive: true });
  await writeFile(
    join(source, "node_modules", "left_pad", "index.js"),
    "module.exports = 1;",
    "utf8",
  );

  assert.equal(await saveDependencies(source), true);
  // Ya hay entrada para esa clave: no se vuelve a escribir.
  assert.equal(await saveDependencies(source), false);

  const target = await makeProject({
    "package.json": PACKAGE_JSON,
    "package-lock.json": '{"lockfileVersion":3,"packages":{"seed":1}}',
  });

  assert.equal(await primeDependencies(target), "hit");
  assert.equal(
    await readFile(join(target, "node_modules", "left_pad", "index.js"), "utf8"),
    "module.exports = 1;",
  );

  // Con node_modules ya presente no se vuelve a sembrar.
  assert.equal(await primeDependencies(target), "present");

  await rm(source, { recursive: true, force: true });
  await rm(target, { recursive: true, force: true });
});

test("sembrar con otro lockfile no reutiliza la entrada", async () => {
  const dir = await makeProject({
    "package.json": PACKAGE_JSON,
    "package-lock.json": '{"lockfileVersion":3,"packages":{"distinto":true}}',
  });

  assert.equal(await primeDependencies(dir), "miss");

  await rm(dir, { recursive: true, force: true });
});

test("sembrar un directorio sin package.json no hace nada", async () => {
  const dir = await makeProject({});
  assert.equal(await primeDependencies(dir), "skip");
  assert.equal(await saveDependencies(dir), false);
  await rm(dir, { recursive: true, force: true });
});

test("installEnv silencia audit/fund pero no fuerza el modo offline", () => {
  const env = installEnv();

  assert.equal(env.npm_config_audit, "false");
  assert.equal(env.npm_config_fund, "false");
  // `prefer-offline` resuelve contra metadatos obsoletos y provoca ETARGET.
  assert.equal(env.npm_config_prefer_offline, undefined);
});

test("el node_modules sembrado no entra en el commit de la tarea", async () => {
  const source = await makeProject({
    "package.json": PACKAGE_JSON,
    "package-lock.json": '{"lockfileVersion":3,"packages":{"guard":1}}',
  });

  await mkdir(join(source, "node_modules", "left_pad"), { recursive: true });
  await writeFile(
    join(source, "node_modules", "left_pad", "index.js"),
    "module.exports = 1;",
    "utf8",
  );

  await saveDependencies(source);

  const target = await makeProject({
    "package.json": PACKAGE_JSON,
    "package-lock.json": '{"lockfileVersion":3,"packages":{"guard":1}}',
  });

  assert.equal(await primeDependencies(target), "hit");

  // Un repo recién inicializado no trae `.gitignore`: el guard tiene que venir
  // dentro del propio node_modules.
  const git = promisify(execFile);
  await git("git", ["init", "-q", "."], { cwd: target });
  await git("git", ["add", "-A"], { cwd: target });

  const { stdout } = await git("git", ["status", "--porcelain"], { cwd: target });

  assert.ok(
    !stdout.includes("node_modules"),
    `node_modules no debería estar en el índice:\n${stdout}`,
  );

  await rm(source, { recursive: true, force: true });
  await rm(target, { recursive: true, force: true });
});

test("prime y save usan el package.json de una subcarpeta", async () => {
  const saved = await mkdtemp(join(tmpdir(), "mrrobot-wt-"));
  const primed = await mkdtemp(join(tmpdir(), "mrrobot-wt-"));

  try {
    for (const dir of [saved, primed]) {
      await mkdir(join(dir, "kanban-app"));
      await writeFile(join(dir, "kanban-app", "package.json"), PACKAGE_JSON, "utf8");
      await writeFile(
        join(dir, "kanban-app", "package-lock.json"),
        '{"lockfileVersion":3,"sub":true}',
        "utf8",
      );
    }

    await mkdir(join(saved, "kanban-app", "node_modules", "left_pad"), {
      recursive: true,
    });
    await writeFile(
      join(saved, "kanban-app", "node_modules", "left_pad", "index.js"),
      "module.exports = 1;",
      "utf8",
    );

    assert.equal(await saveDependencies(saved), true);
    assert.equal(await primeDependencies(primed), "hit");
    assert.equal(
      await readFile(
        join(primed, "kanban-app", "node_modules", "left_pad", "index.js"),
        "utf8",
      ),
      "module.exports = 1;",
    );
  } finally {
    await rm(saved, { recursive: true, force: true });
    await rm(primed, { recursive: true, force: true });
  }
});
