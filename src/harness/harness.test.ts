import { test } from "node:test";
import assert from "node:assert";
import { harnessLoop, pruneHistory } from "./loop.js";
import type { HarnessMessage } from "./types.js";
import { ScriptedChatClient } from "./mock-client.js";
import { LocalSandbox, DEFAULT_SANDBOX_POLICY } from "../sandbox/local.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

test("harness loop: ejecuta iteraciones y respeta límites", async () => {
  const tempDir = mkdtempSync(resolve(tmpdir(), "harness-test-"));

  try {
    const sandbox = new LocalSandbox(tempDir, DEFAULT_SANDBOX_POLICY);

    // Script que siempre devuelve la herramienta finish
    const infiniteScript = Array.from({ length: 100 }, () => ({
      role: "tool" as const,
      toolCalls: [
        {
          name: "finish",
          argumentsRaw: JSON.stringify({ output: "Completado" }),
        },
      ],
    }));

    const client = new ScriptedChatClient(infiniteScript);

    try {
      const result = await harnessLoop({
        client,
        sandbox,
        prompt: "tarea de prueba",
      });

      // El harness agota iteraciones (finish no termina el loop, solo es otra herramienta)
      assert.ok(result.iterations > 0, "debe ejecutar iteraciones");
      assert.ok(result.toolCalls > 0, "debe ejecutar tool calls");
      console.log(
        `✓ Harness ejecutó: ${result.iterations} iteraciones, ${result.toolCalls} tool calls`
      );
    } catch (err: unknown) {
      // Si lanza HarnessBudgetError, es porque agotó iteraciones (también está bien)
      const error = err as { name?: string };
      if (error.name === "HarnessBudgetError") {
        console.log(`✓ Harness agotó presupuesto como esperado`);
      } else {
        throw err;
      }
    } finally {
      await sandbox.dispose();
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("harness loop: rechaza cuando excede maxToolCalls", async () => {
  const tempDir = mkdtempSync(resolve(tmpdir(), "harness-test-"));

  try {
    const sandbox = new LocalSandbox(tempDir, DEFAULT_SANDBOX_POLICY);

    // Script que siempre devuelve 2 tool calls (excede límite de 1)
    const script = Array.from({ length: 100 }, () => ({
      role: "tool" as const,
      toolCalls: [
        {
          name: "write_file",
          argumentsRaw: JSON.stringify({ path: "file1.txt", content: "contenido 1" }),
        },
        {
          name: "write_file",
          argumentsRaw: JSON.stringify({ path: "file2.txt", content: "contenido 2" }),
        },
      ],
    }));

    const client = new ScriptedChatClient(script);

    try {
      await harnessLoop({
        client,
        sandbox,
        prompt: "tarea de prueba",
        bounds: {
          maxIterations: 100,
          maxToolCalls: 1, // Solo 1 tool call permitido
          timeoutMs: 5000,
          maxToolOutputChars: 1000,
          maxHistoryChars: 10000,
          maxInvalidToolCalls: 3,
          maxNoToolReplies: 2,
          maxSandboxViolations: 5,
        },
      });

      assert.fail("debería lanzar HarnessBudgetError");
    } catch (err: unknown) {
      const error = err as { name?: string };
      assert.strictEqual(
        error.name,
        "HarnessBudgetError",
        "error debe ser HarnessBudgetError"
      );
      console.log(`✓ Harness rechazó exceso de tool calls`);
    } finally {
      await sandbox.dispose();
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("harness loop: respeta maxIterations", async () => {
  const tempDir = mkdtempSync(resolve(tmpdir(), "harness-test-"));

  try {
    const sandbox = new LocalSandbox(tempDir, DEFAULT_SANDBOX_POLICY);

    // Script que devuelve herramientas sin terminar
    const script = Array.from({ length: 100 }, () => ({
      role: "tool" as const,
      toolCalls: [
        {
          name: "write_file",
          argumentsRaw: JSON.stringify({ path: "test.txt", content: "contenido" }),
        },
      ],
    }));

    const client = new ScriptedChatClient(script);

    try {
      const result = await harnessLoop({
        client,
        sandbox,
        prompt: "tarea de prueba",
        bounds: {
          maxIterations: 2,
          maxToolCalls: 100,
          timeoutMs: 5000,
          maxToolOutputChars: 1000,
          maxHistoryChars: 10000,
          maxInvalidToolCalls: 3,
          maxNoToolReplies: 2,
          maxSandboxViolations: 5,
        },
      });

      // Debería terminar cuando agota iteraciones
      assert.ok(result.iterations <= 2, "debe respetar maxIterations");
      console.log(`✓ Harness respetó maxIterations: ${result.iterations}`);
    } catch (err: unknown) {
      // O lanza HarnessBudgetError, ambos son válidos
      const error = err as { name?: string };
      assert.ok(error.name === "HarnessBudgetError");
      console.log(`✓ Harness rechazó exceso de iteraciones`);
    } finally {
      await sandbox.dispose();
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

/**
 * Un `tool` solo es válido si le precede un assistant con `tool_calls`; si no,
 * la API responde 400. Replica la validación del proveedor.
 */
function hasOrphanTool(messages: HarnessMessage[]): boolean {
  let assistantHadToolCalls = false;

  for (const message of messages) {
    if (message.role === "assistant") {
      assistantHadToolCalls = (message.toolCalls?.length ?? 0) > 0;
    } else if (message.role === "tool") {
      if (!assistantHadToolCalls) return true;
    } else {
      assistantHadToolCalls = false;
    }
  }

  return false;
}

function longHistory(turns: number): HarnessMessage[] {
  const history: HarnessMessage[] = [
    { role: "system", content: "system" },
    { role: "user", content: "tarea" },
  ];

  for (let i = 0; i < turns; i++) {
    history.push({
      role: "assistant",
      toolCalls: [
        { id: `c${i}a`, name: "read_file", argumentsRaw: "{}" },
        { id: `c${i}b`, name: "read_file", argumentsRaw: "{}" },
      ],
    });
    history.push({
      role: "tool",
      toolCallId: `c${i}a`,
      name: "read_file",
      content: "x".repeat(2000),
    });
    history.push({
      role: "tool",
      toolCallId: `c${i}b`,
      name: "read_file",
      content: "x".repeat(2000),
    });
  }

  return history;
}

test("pruneHistory no deja mensajes tool huérfanos", () => {
  const history = longHistory(8);

  // La ventana ingenua slice(-4) empezaría en un `tool`.
  assert.equal(history[history.length - 4]?.role, "tool");

  const pruned = pruneHistory(history, 5000);

  assert.equal(pruned[0]?.role, "system");
  assert.equal(pruned[1]?.role, "user");
  assert.equal(hasOrphanTool(pruned), false);
  // Se conserva el primer user (la tarea) una sola vez.
  assert.equal(pruned.filter((m) => m.role === "user" && m.content === "tarea").length, 1);
});

test("pruneHistory no toca el historial si cabe en el límite", () => {
  const history = longHistory(1);
  assert.deepEqual(pruneHistory(history, 1_000_000), history);
});
