import assert from "node:assert/strict";
import { test } from "node:test";
import { codexArgs } from "./codex.js";

const ENV = "MRROBOT_CODEX_NETWORK";

function withEnv(value: string | undefined, run: () => void): void {
  const previous = process.env[ENV];

  if (value === undefined) {
    delete process.env[ENV];
  } else {
    process.env[ENV] = value;
  }

  try {
    run();
  } finally {
    if (previous === undefined) {
      delete process.env[ENV];
    } else {
      process.env[ENV] = previous;
    }
  }
}

test("el worker de Codex tiene red para instalar dependencias", () => {
  withEnv(undefined, () => {
    assert.deepEqual(codexArgs("haz X"), [
      "exec",
      "--sandbox",
      "workspace-write",
      "-c",
      "sandbox_workspace_write.network_access=true",
      "haz X",
    ]);
  });
});

test("MRROBOT_CODEX_NETWORK=0 deja el sandbox sin red", () => {
  withEnv("0", () => {
    assert.deepEqual(codexArgs("haz X"), [
      "exec",
      "--sandbox",
      "workspace-write",
      "haz X",
    ]);
  });
});

test("en solo lectura no se toca la red", () => {
  withEnv(undefined, () => {
    assert.deepEqual(codexArgs("revisa", { sandbox: "read-only" }), [
      "exec",
      "--sandbox",
      "read-only",
      "revisa",
    ]);
  });
});
