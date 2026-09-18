import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAttachments } from "./parse.js";

// "aGVsbG8=" = base64("hello"), 5 bytes reales.
const HELLO_B64 = "aGVsbG8=";

function attachment(overrides: Record<string, unknown> = {}) {
  return {
    name: "nota.md",
    type: "markdown",
    mimeType: "text/markdown",
    size: 5,
    data: HELLO_B64,
    ...overrides,
  };
}

test("parseAttachments acepta un adjunto cuyo size coincide con sus datos", () => {
  const result = parseAttachments([attachment()]);
  assert.equal(result?.length, 1);
  assert.equal(result?.[0]?.size, 5);
});

test("parseAttachments rechaza un size que no coincide con el base64 real", () => {
  // El cliente declara 0 para saltarse el límite de 2MB con datos reales.
  assert.throws(
    () => parseAttachments([attachment({ size: 0 })]),
    /no coincide/,
  );
});

test("parseAttachments rechaza un size mayor que los datos reales", () => {
  assert.throws(
    () => parseAttachments([attachment({ size: 999 })]),
    /no coincide/,
  );
});

test("parseAttachments sigue aplicando el límite de 2MB por adjunto", () => {
  const bigBuffer = Buffer.alloc(3 * 1024 * 1024, "a");
  const data = bigBuffer.toString("base64");

  assert.throws(
    () =>
      parseAttachments([
        attachment({ size: bigBuffer.length, data, name: "grande.md" }),
      ]),
    /excede 2MB/,
  );
});

test("parseAttachments sigue aplicando el límite de 5MB en total", () => {
  const chunk = Buffer.alloc(1.8 * 1024 * 1024, "a");
  const data = chunk.toString("base64");

  assert.throws(
    () =>
      parseAttachments([
        attachment({ size: chunk.length, data, name: "uno.md" }),
        attachment({ size: chunk.length, data, name: "dos.md" }),
        attachment({ size: chunk.length, data, name: "tres.md" }),
      ]),
    /excede 5MB/,
  );
});
