import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_LIMIT_RETRY,
  isLimitReason,
  limitRetryDelayMs,
  parseRetryAfterMs,
  resolveLimitRetry,
} from "./limit-retry.js";

test("isLimitReason reconoce rate limit y cuota/sesión", () => {
  assert.equal(isLimitReason("rate_limit"), true);
  assert.equal(isLimitReason("usage_limit"), true);
  assert.equal(isLimitReason("auth"), false);
  assert.equal(isLimitReason("network"), false);
  assert.equal(isLimitReason(undefined), false);
});

test("parseRetryAfterMs interpreta segundos por defecto", () => {
  assert.equal(parseRetryAfterMs(new Error("429 rate limit, retry after 30")), 30_000);
  assert.equal(parseRetryAfterMs(new Error("retry-after: 5")), 5_000);
});

test("parseRetryAfterMs interpreta ms, minutos y horas", () => {
  assert.equal(parseRetryAfterMs(new Error("retry after 500ms")), 500);
  assert.equal(parseRetryAfterMs(new Error("retry after 2m")), 120_000);
  assert.equal(parseRetryAfterMs(new Error("retry after 1h")), 3_600_000);
});

test("parseRetryAfterMs devuelve undefined sin retry after", () => {
  assert.equal(parseRetryAfterMs(new Error("429 too many requests")), undefined);
});

test("limitRetryDelayMs prioriza el retry after", () => {
  const policy = { maxLimitRetries: 3, baseDelayMs: 1_000, maxDelayMs: 60_000 };
  assert.equal(
    limitRetryDelayMs(0, new Error("rate limit, retry after 7"), policy),
    7_000,
  );
});

test("limitRetryDelayMs usa backoff exponencial y respeta el tope", () => {
  const policy = { maxLimitRetries: 3, baseDelayMs: 1_000, maxDelayMs: 4_000 };
  assert.equal(limitRetryDelayMs(0, new Error("rate limit"), policy), 1_000);
  assert.equal(limitRetryDelayMs(1, new Error("rate limit"), policy), 2_000);
  assert.equal(limitRetryDelayMs(2, new Error("rate limit"), policy), 4_000);
  assert.equal(limitRetryDelayMs(5, new Error("rate limit"), policy), 4_000);
});

test("limitRetryDelayMs acota un retry after desmedido", () => {
  const policy = { maxLimitRetries: 3, baseDelayMs: 1_000, maxDelayMs: 60_000 };
  assert.equal(
    limitRetryDelayMs(0, new Error("rate limit, retry after 999999"), policy),
    60_000,
  );
});

test("resolveLimitRetry aplica los valores por defecto", () => {
  assert.deepEqual(resolveLimitRetry(), DEFAULT_LIMIT_RETRY);
  assert.deepEqual(resolveLimitRetry({ baseDelayMs: 5 }), {
    ...DEFAULT_LIMIT_RETRY,
    baseDelayMs: 5,
  });
});
