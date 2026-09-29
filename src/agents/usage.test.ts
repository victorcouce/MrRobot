import assert from "node:assert/strict";
import { test } from "node:test";
import {
  recordUsage,
  usageFromClaude,
  usageFromOpenAI,
  withUsageMeter,
} from "./usage.js";
import { extractStreamJsonUsage } from "../providers/claude-stream.js";
import { formatLogLine } from "../../shared/log-format.js";

test("withUsageMeter acumula el uso de las llamadas del intento", async () => {
  const metered = await withUsageMeter(async () => {
    recordUsage({ input: 100, cachedInput: 60, output: 10 });
    await Promise.resolve();
    recordUsage({ input: 50, output: 5 });
    return "ok";
  });

  assert.ok("result" in metered);
  assert.equal(metered.result, "ok");
  assert.deepEqual(metered.usage, { input: 150, cachedInput: 60, output: 15, calls: 2 });
});

test("withUsageMeter conserva el uso aunque el intento falle", async () => {
  const metered = await withUsageMeter(async () => {
    recordUsage({ input: 10, output: 1 });
    throw new Error("boom");
  });

  assert.ok("error" in metered);
  assert.equal(metered.usage.input, 10);
});

test("los medidores concurrentes no se mezclan y fuera de uno no se registra nada", async () => {
  recordUsage({ input: 999 });

  const [a, b] = await Promise.all([
    withUsageMeter(async () => {
      await new Promise((r) => setTimeout(r, 5));
      recordUsage({ input: 1 });
    }),
    withUsageMeter(async () => {
      recordUsage({ input: 2 });
    }),
  ]);

  assert.equal(a.usage.input, 1);
  assert.equal(b.usage.input, 2);
});

test("usageFromOpenAI lee la caché de DeepSeek y la de OpenAI", () => {
  assert.deepEqual(
    usageFromOpenAI({ prompt_tokens: 100, completion_tokens: 7, prompt_cache_hit_tokens: 64 }),
    { input: 100, cachedInput: 64, output: 7 },
  );
  assert.deepEqual(
    usageFromOpenAI({
      prompt_tokens: 100,
      completion_tokens: 7,
      prompt_tokens_details: { cached_tokens: 32 },
    }),
    { input: 100, cachedInput: 32, output: 7 },
  );
  assert.equal(usageFromOpenAI(undefined), undefined);
});

test("usageFromClaude suma la caché al input y extractStreamJsonUsage la encuentra", () => {
  const raw = [
    JSON.stringify({ type: "assistant", message: { content: [] } }),
    JSON.stringify({
      type: "result",
      result: "Listo.",
      usage: {
        input_tokens: 10,
        cache_read_input_tokens: 900,
        cache_creation_input_tokens: 90,
        output_tokens: 42,
      },
    }),
  ].join("\n");

  assert.deepEqual(usageFromClaude(extractStreamJsonUsage(raw)), {
    input: 1000,
    cachedInput: 900,
    output: 42,
  });
});

test("formatLogLine muestra los tokens del intento", () => {
  const line = formatLogLine({
    type: "agent.completed",
    createdAt: "2026-09-22T10:00:00.000Z",
    payload: {
      scope: "worker",
      agent: "deepseek / deepseek-flash",
      durationMs: 1500,
      usage: { input: 1200, cachedInput: 1000, output: 80, calls: 2 },
    },
  });

  assert.match(line, /tokens=1200in\/1000cache\/80out/);
});
