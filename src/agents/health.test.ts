import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AgentHealth,
  skipAccountLimited,
  DEFAULT_LIMIT_COOLDOWN_MS,
  MAX_LIMIT_COOLDOWN_MS,
} from "./health.js";
import type { AgentCandidate } from "./types.js";

const HAIKU: AgentCandidate = { provider: "claude", model: "haiku" };
const SONNET: AgentCandidate = { provider: "claude", model: "sonnet" };
const CODEX: AgentCandidate = { provider: "codex" };

test("order deja la cadena intacta si no hay cuarentenas", () => {
  const health = new AgentHealth();
  const chain = [HAIKU, SONNET, CODEX];

  assert.deepEqual(health.order(chain), chain);
});

test("order relega al final los agentes en cuarentena", () => {
  const health = new AgentHealth({ now: () => 1_000 });

  health.markLimited(HAIKU, new Error("429 rate limit"));

  assert.deepEqual(health.order([HAIKU, SONNET, CODEX]), [
    SONNET,
    CODEX,
    HAIKU,
  ]);
});

test("order conserva el orden relativo de los disponibles", () => {
  const health = new AgentHealth({ now: () => 1_000 });

  health.markLimited(SONNET, new Error("429 rate limit"));

  assert.deepEqual(health.order([HAIKU, SONNET, CODEX]), [
    HAIKU,
    CODEX,
    SONNET,
  ]);
});

test("la cuarentena caduca y el agente recupera su posición", () => {
  let now = 1_000;
  const health = new AgentHealth({ cooldownMs: 5_000, now: () => now });

  health.markLimited(HAIKU, new Error("rate limit"));
  assert.equal(health.isLimited(HAIKU), true);

  now += 4_999;
  assert.equal(health.isLimited(HAIKU), true);

  now += 1;
  assert.equal(health.isLimited(HAIKU), false);
  assert.deepEqual(health.order([HAIKU, SONNET]), [HAIKU, SONNET]);
});

test("el retry after del proveedor extiende la cuarentena por encima del mínimo", () => {
  const health = new AgentHealth({ cooldownMs: 1_000, now: () => 0 });

  const cooldown = health.markLimited(
    HAIKU,
    new Error("rate limit, retry after 120"),
  );

  assert.equal(cooldown, 120_000);
});

test("un retry after corto no acorta la cuarentena mínima", () => {
  const health = new AgentHealth({ cooldownMs: 60_000, now: () => 0 });

  assert.equal(
    health.markLimited(HAIKU, new Error("rate limit, retry after 1")),
    60_000,
  );
});

test("la cuarentena respeta el tope superior", () => {
  const health = new AgentHealth({
    cooldownMs: 1_000,
    maxCooldownMs: 10_000,
    now: () => 0,
  });

  assert.equal(
    health.markLimited(HAIKU, new Error("retry after 999999")),
    10_000,
  );
});

test("recordSuccess levanta la cuarentena del agente", () => {
  const health = new AgentHealth({ now: () => 0 });

  health.markLimited(HAIKU, new Error("rate limit"));
  health.recordSuccess(HAIKU);

  assert.equal(health.isLimited(HAIKU), false);
});

test("la cuarentena es por agente: no afecta a otro modelo", () => {
  const health = new AgentHealth({ now: () => 0 });

  health.markLimited(HAIKU, new Error("rate limit"));

  assert.equal(health.isLimited(HAIKU), true);
  assert.equal(health.isLimited(SONNET), false);
});

test("markLimited devuelve 0 si ya estaba en cuarentena más larga", () => {
  const health = new AgentHealth({ cooldownMs: 60_000, now: () => 0 });

  assert.equal(health.markLimited(HAIKU, new Error("rate limit")), 60_000);
  assert.equal(health.markLimited(HAIKU, new Error("rate limit")), 0);
});

test("reset limpia todas las cuarentenas", () => {
  const health = new AgentHealth({ now: () => 0 });

  health.markLimited(HAIKU, new Error("rate limit"));
  health.markLimited(CODEX, new Error("usage limit"));
  health.reset();

  assert.deepEqual(health.order([HAIKU, SONNET, CODEX]), [
    HAIKU,
    SONNET,
    CODEX,
  ]);
});

test("los valores por defecto de cuarentena son coherentes", () => {
  assert.ok(DEFAULT_LIMIT_COOLDOWN_MS > 0);
  assert.ok(MAX_LIMIT_COOLDOWN_MS >= DEFAULT_LIMIT_COOLDOWN_MS);
});

test("un límite de uso pone en cuarentena toda la cuenta del proveedor", () => {
  const health = new AgentHealth({ now: () => 1_000 });

  health.markLimited(
    HAIKU,
    new Error("You've hit your session limit · resets 3:20pm (Europe/Madrid)"),
  );

  assert.equal(health.isLimited(SONNET), true);
  assert.equal(health.isAccountLimited(SONNET), true);
  assert.equal(health.isLimited(CODEX), false);
  assert.deepEqual(health.order([HAIKU, SONNET, CODEX]), [CODEX, HAIKU, SONNET]);

  // Con otra cuenta disponible, se salta; si todas están agotadas, no.
  assert.equal(skipAccountLimited(SONNET, [HAIKU, SONNET, CODEX], health), true);
  assert.equal(skipAccountLimited(SONNET, [HAIKU, SONNET], health), false);

  // Un éxito de cualquier modelo de la cuenta levanta la cuarentena.
  health.recordSuccess(SONNET);
  assert.equal(health.isLimited(HAIKU), false);
});

test("un rate limit sigue siendo por modelo", () => {
  const health = new AgentHealth({ now: () => 1_000 });

  health.markLimited(HAIKU, new Error("429 rate limit"));

  assert.equal(health.isLimited(HAIKU), true);
  assert.equal(health.isLimited(SONNET), false);
  assert.equal(health.isAccountLimited(HAIKU), false);
});
