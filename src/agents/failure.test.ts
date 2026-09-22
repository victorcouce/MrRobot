import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyFailure, renderPreviousFailures } from "./failure.js";

test("renderPreviousFailures resume causas distintas y omite límites y éxitos", () => {
  const block = renderPreviousFailures([
    { status: "failed", error: "[harness] agotadas 24 iteraciones" },
    { status: "failed", error: "[harness] agotadas 40 iteraciones" },
    { status: "failed", error: "[claude] You've hit your session limit · resets 3:20pm" },
    { status: "failed", error: '[sandbox] comando no permitido: "ls" con args [-la]' },
    { status: "success" },
  ]);

  assert.match(block, /^INTENTOS ANTERIORES FALLIDOS/);
  // El más reciente primero; una línea por causa.
  assert.equal(block.split("\n").length, 3);
  assert.match(block, /sandbox/);
  assert.match(block, /40 iteraciones/);
  assert.doesNotMatch(block, /session limit/);
});

test("renderPreviousFailures devuelve vacío sin fallos útiles", () => {
  assert.equal(renderPreviousFailures([]), "");
  assert.equal(
    renderPreviousFailures([{ status: "failed", error: "429 rate limit" }]),
    "",
  );
});

test("classifyFailure reconoce el plazo del harness", () => {
  assert.equal(classifyFailure("[harness] superó el plazo de 300000ms"), "harness: plazo");
});
