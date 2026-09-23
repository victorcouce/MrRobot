import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  ensureDependencies,
  isNoTestsFailure,
  runDevSmokeCheck,
  runInstallCheck,
  runProjectChecks,
} from "./checks.js";

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "mrrobot-checks-"));
}

test("ensureDependencies no hace nada sin package.json", async () => {
  const dir = await tempDir();

  try {
    await ensureDependencies(dir);
    assert.ok(true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("ensureDependencies omite la instalación si ya hay node_modules", async () => {
  const dir = await tempDir();

  try {
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ scripts: { test: "echo ok" } }),
    );
    await mkdir(join(dir, "node_modules"));

    await ensureDependencies(dir);
    assert.ok(true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("runInstallCheck no se ejecuta sin package.json", async () => {
  const dir = await tempDir();

  try {
    assert.equal(await runInstallCheck(dir), undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("runDevSmokeCheck no se ejecuta sin script de arranque", async () => {
  const dir = await tempDir();

  try {
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ scripts: { build: "echo build" } }),
    );

    assert.equal(await runDevSmokeCheck(dir), undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("runDevSmokeCheck aprueba cuando el servidor imprime una URL", async () => {
  const dir = await tempDir();
  const script = `node -e "console.log('http://localhost:5173/'); setInterval(() => {}, 1000)"`;

  try {
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ scripts: { dev: script } }),
    );

    const result = await runDevSmokeCheck(dir);
    assert.equal(result?.success, true);
    assert.match(result?.stdout ?? "", /localhost:5173/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("runDevSmokeCheck falla si el script termina sin arrancar", async () => {
  const dir = await tempDir();

  try {
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ scripts: { dev: `node -e "process.exit(1)"` } }),
    );

    const result = await runDevSmokeCheck(dir);
    assert.equal(result?.success, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("runProjectChecks mantiene build antes que test y corre el resto en paralelo", async () => {
  const dir = await tempDir();
  const marker = join(dir, "order.txt");

  const append = (name: string) =>
    `node -e "require('fs').appendFileSync(process.env.MRROBOT_MARKER,'${name}\\n')"`;

  try {
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({
        scripts: {
          typecheck: append("typecheck"),
          build: append("build"),
          test: append("test"),
        },
      }),
    );

    process.env.MRROBOT_MARKER = marker;
    const results = await runProjectChecks(dir, ["typecheck", "build", "test"]);

    assert.deepEqual(
      results.map((result) => result.command),
      ["npm run typecheck", "npm run build", "npm run test"],
    );
    assert.ok(results.every((result) => result.success));

    const order = (await readFile(marker, "utf8")).trim().split("\n");
    assert.equal(order.length, 3);
    assert.ok(order.indexOf("test") > order.indexOf("build"));
    assert.ok(order.includes("typecheck"));
  } finally {
    delete process.env.MRROBOT_MARKER;
    await rm(dir, { recursive: true, force: true });
  }
});

test("runProjectChecks conserva el final de una salida larga (donde está el error)", async () => {
  const dir = await tempDir();

  try {
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({
        scripts: {
          test: `node -e "console.error('x'.repeat(10000) + 'ERROR-FINAL'); process.exit(1)"`,
        },
      }),
    );

    const [result] = await runProjectChecks(dir, ["test"]);

    assert.equal(result?.success, false);
    assert.match(result?.stderr ?? "", /ERROR-FINAL$/);
    assert.ok((result?.stderr ?? "").length < 5000);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("isNoTestsFailure reconoce runners sin tests y no un fallo real", () => {
  assert.equal(isNoTestsFailure("Could not find 'tests/'\n> calc@1.0.0 test"), true);
  assert.equal(isNoTestsFailure("No test files found, exiting with code 1"), true);
  assert.equal(isNoTestsFailure("No tests found, exiting with code 1"), true);
  assert.equal(
    isNoTestsFailure("ℹ tests 5\nℹ pass 4\nℹ fail 1\nCould not find 'x'"),
    false,
  );
  assert.equal(isNoTestsFailure("AssertionError: expected 1 to equal 2"), false);
});

test("runProjectChecks da por bueno un test que falla solo por no haber tests", async () => {
  const dir = await tempDir();

  try {
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ scripts: { test: "node --test tests/" } }),
    );

    const [result] = await runProjectChecks(dir, ["test"]);

    assert.equal(result?.success, true);
    assert.equal(result?.noTests, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
