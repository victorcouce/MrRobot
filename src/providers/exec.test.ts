import assert from "node:assert/strict";
import { test } from "node:test";
import { execCli } from "./exec.js";

test("execCli emite stdout en vivo y devuelve la salida", async () => {
  const chunks: string[] = [];

  const output = await execCli(
    "node",
    process.execPath,
    ["-e", "process.stdout.write('hola');"],
    { onOutput: (chunk) => chunks.push(chunk) },
  );

  assert.equal(output, "hola");
  assert.equal(chunks.join(""), "hola");
});

test("execCli rechaza con el código de salida y el detalle", async () => {
  await assert.rejects(
    () =>
      execCli("node", process.execPath, [
        "-e",
        "process.stderr.write('boom'); process.exit(3);",
      ]),
    /exit code: 3.*boom/s,
  );
});

test("execCli respeta AbortSignal", async () => {
  const controller = new AbortController();

  const promise = execCli(
    "node",
    process.execPath,
    ["-e", "setTimeout(() => {}, 10000);"],
    { signal: controller.signal },
  );

  setTimeout(() => controller.abort(), 20);

  await assert.rejects(promise, /cancelada/);
});
