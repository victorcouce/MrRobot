import assert from "node:assert/strict";
import { test } from "node:test";
import { claudeArgs, claudePermissionMode } from "./claude.js";

const ENV = "MRROBOT_CLAUDE_PERMISSION_MODE";

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

test("el worker puede escribir en su worktree", () => {
  withEnv(undefined, () => {
    // Sin --permission-mode, `claude -p` deniega toda edición (no hay a quien
    // preguntar) y la tarea termina sin haber tocado un solo archivo.
    assert.equal(claudePermissionMode(undefined), "acceptEdits");
    assert.equal(claudePermissionMode("workspace-write"), "acceptEdits");

    const args = claudeArgs("haz X", "sonnet");
    assert.deepEqual(args, [
      "-p",
      "haz X",
      "--permission-mode",
      "acceptEdits",
      "--model",
      "sonnet",
      "--output-format",
      "json",
    ]);
  });
});

test("los roles de solo lectura no piden permisos de escritura", () => {
  withEnv(undefined, () => {
    assert.equal(claudePermissionMode("read-only"), undefined);
    assert.deepEqual(claudeArgs("revisa", undefined, { sandbox: "read-only" }), [
      "-p",
      "revisa",
      "--output-format",
      "json",
    ]);
  });
});

test("el modo de permisos se puede subir por entorno", () => {
  withEnv("bypassPermissions", () => {
    assert.equal(claudePermissionMode(undefined), "bypassPermissions");
  });
});

test("un modo inválido cae en el valor por defecto", () => {
  withEnv("yolo", () => {
    assert.equal(claudePermissionMode(undefined), "acceptEdits");
  });
});
