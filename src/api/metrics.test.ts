import assert from "node:assert/strict";
import { test } from "node:test";
import { computeMetrics } from "./metrics.js";
import type { ProjectEvent } from "../storage/types.js";

function event(type: string, payload?: unknown): ProjectEvent {
  return {
    id: `${type}-${Math.random()}`,
    projectId: "p",
    type,
    payload,
    createdAt: new Date(),
  } as ProjectEvent;
}

test("computeMetrics agrega intentos, éxito y tiempo por agente", () => {
  const metrics = computeMetrics([
    [
      event("agent.started", { scope: "worker", agent: "claude / haiku" }),
      event("agent.completed", {
        scope: "worker",
        agent: "claude / haiku",
        durationMs: 1000,
      }),
      event("agent.started", { scope: "worker", agent: "deepseek / flash" }),
      event("agent.failed", {
        scope: "worker",
        agent: "deepseek / flash",
        durationMs: 2000,
        error: "[harness] agotadas 24 iteraciones",
      }),
      event("task.started"),
      event("task.failed"),
      event("supervisor.replan"),
    ],
  ]);

  const haiku = metrics.agentRuns.find((r) => r.agent === "claude / haiku");
  const deepseek = metrics.agentRuns.find(
    (r) => r.agent === "deepseek / flash",
  );

  assert.equal(haiku?.attempts, 1);
  assert.equal(haiku?.ok, 1);
  assert.equal(haiku?.totalMs, 1000);
  assert.equal(deepseek?.failed, 1);
  assert.deepEqual(metrics.tasks, { attempts: 1, completed: 0, failed: 1 });
  assert.equal(metrics.replans, 1);
  assert.deepEqual(metrics.topFailures, [
    { reason: "harness: iteraciones", count: 1 },
  ]);
});

test("computeMetrics clasifica sandbox y rate limit", () => {
  const metrics = computeMetrics([
    [
      event("agent.failed", {
        scope: "worker",
        agent: "x",
        error: '[sandbox] comando no permitido: "ls"',
      }),
      event("agent.failed", {
        scope: "worker",
        agent: "x",
        error: "You've hit your session limit",
      }),
      event("agent.failed", {
        scope: "worker",
        agent: "x",
        error: "algo raro",
      }),
    ],
  ]);

  const reasons = Object.fromEntries(
    metrics.topFailures.map((f) => [f.reason, f.count]),
  );
  assert.equal(reasons["sandbox: comando no permitido"], 1);
  assert.equal(reasons["rate limit"], 1);
  assert.equal(reasons["otros"], 1);
});

test("computeMetrics con varios proyectos suma todo", () => {
  const metrics = computeMetrics([
    [event("task.completed")],
    [event("task.completed"), event("task.failed")],
  ]);

  assert.equal(metrics.projects, 2);
  assert.deepEqual(metrics.tasks, { attempts: 0, completed: 2, failed: 1 });
});

test("computeMetrics suma tokens de intentos completados y fallidos", () => {
  const metrics = computeMetrics([
    [
      event("agent.completed", {
        scope: "worker",
        agent: "deepseek / flash",
        usage: { input: 1000, cachedInput: 800, output: 50, calls: 3 },
      }),
      event("agent.failed", {
        scope: "worker",
        agent: "deepseek / flash",
        error: "[harness] agotadas 40 iteraciones",
        usage: { input: 5000, cachedInput: 1000, output: 200, calls: 40 },
      }),
    ],
  ]);

  const flash = metrics.agentRuns.find((r) => r.agent === "deepseek / flash");
  assert.equal(flash?.inputTokens, 6000);
  assert.equal(flash?.cachedInputTokens, 1800);
  assert.equal(flash?.outputTokens, 250);
});
