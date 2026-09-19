import assert from "node:assert/strict";
import { test } from "node:test";
import { createStreamJsonRelay, extractStreamJsonResult } from "./claude-stream.js";

function line(obj: unknown): string {
  return `${JSON.stringify(obj)}\n`;
}

test("createStreamJsonRelay narra tool_use legibles e ignora el resto", () => {
  const narrated: string[] = [];
  const relay = createStreamJsonRelay((chunk) => narrated.push(chunk));

  relay(line({ type: "system", subtype: "init" }));
  relay(
    line({
      type: "assistant",
      message: {
        content: [
          { type: "tool_use", name: "Read", input: { file_path: "src/index.ts" } },
        ],
      },
    }),
  );
  relay(
    line({
      type: "assistant",
      message: { content: [{ type: "text", text: "Voy a revisar el archivo." }] },
    }),
  );
  relay(line({ type: "user", message: { content: [{ type: "tool_result" }] } }));

  assert.deepEqual(narrated, [
    "🔧 Read: src/index.ts\n",
    "💬 Voy a revisar el archivo.\n",
  ]);
});

test("createStreamJsonRelay reconstruye una línea partida entre dos chunks", () => {
  const narrated: string[] = [];
  const relay = createStreamJsonRelay((chunk) => narrated.push(chunk));
  const full = line({
    type: "assistant",
    message: { content: [{ type: "tool_use", name: "Bash", input: { command: "npm test" } }] },
  });

  relay(full.slice(0, 20));
  relay(full.slice(20));

  assert.deepEqual(narrated, ["🔧 Bash: npm test\n"]);
});

test("createStreamJsonRelay usa un genérico para herramientas sin formateador propio", () => {
  const narrated: string[] = [];
  const relay = createStreamJsonRelay((chunk) => narrated.push(chunk));

  relay(
    line({
      type: "assistant",
      message: { content: [{ type: "tool_use", name: "NotebookEdit", input: {} }] },
    }),
  );

  assert.deepEqual(narrated, ["🔧 NotebookEdit\n"]);
});

test("extractStreamJsonResult devuelve el texto del último mensaje result", () => {
  const raw = [
    line({ type: "system", subtype: "init" }),
    line({ type: "assistant", message: { content: [{ type: "text", text: "..." }] } }),
    line({ type: "result", subtype: "success", result: "Listo." }),
  ].join("");

  assert.equal(extractStreamJsonResult(raw), "Listo.");
});

test("extractStreamJsonResult devuelve undefined sin línea result", () => {
  const raw = line({ type: "assistant", message: { content: [] } });
  assert.equal(extractStreamJsonResult(raw), undefined);
});
