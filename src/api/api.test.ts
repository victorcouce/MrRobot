import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProjectEvent } from "../storage/types.js";
import { Runtime } from "./runtime.js";
import { buildApiServer } from "./server.js";

async function waitFor(
  runtime: Runtime,
  projectId: string,
  predicate: (status: string) => boolean,
  timeoutMs = 8000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const project = await runtime.getProject(projectId);
    if (predicate(project.status)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error("timeout esperando estado del proyecto");
}

test("runtime mock: crear → plan → run → completed", async () => {
  const runtime = await Runtime.create({ mock: true });

  const draft = await runtime.createProject({ goal: "librería TS con sum" });
  assert.equal(draft.status, "draft");
  assert.equal(draft.tasks.length, 0);

  const planning = await runtime.generatePlan(draft.id);
  assert.equal(planning.status, "planning");

  await waitFor(runtime, draft.id, (status) => status === "ready");

  const ready = await runtime.getProject(draft.id);
  assert.equal(ready.status, "ready");
  assert.ok(ready.tasks.length >= 3);

  await runtime.run(draft.id);
  await waitFor(runtime, draft.id, (status) => status === "completed");

  const completed = await runtime.getProject(draft.id);
  assert.equal(completed.status, "completed");
  assert.equal(completed.stats.done, completed.stats.total);
  assert.ok(completed.resultBranch);
  assert.ok(completed.resultCommit);

  const events = await runtime.listEvents(draft.id);
  const types = events.map((event) => event.type);
  assert.ok(types.includes("project.created"));
  assert.ok(types.includes("plan.generated"));
  assert.ok(types.includes("project.completed"));

  await runtime.shutdown();
});

test("runtime mock: escenario fail deja el proyecto failed", async () => {
  const runtime = await Runtime.create({ mock: true, scenario: "fail" });

  const draft = await runtime.createProject({ goal: "x" });
  await runtime.generatePlan(draft.id);
  await waitFor(runtime, draft.id, (status) => status === "ready");
  await runtime.run(draft.id);
  await waitFor(runtime, draft.id, (status) => status === "failed");

  const failed = await runtime.getProject(draft.id);
  assert.equal(failed.status, "failed");
  assert.ok(failed.tasks.some((task) => task.status === "failed"));

  await runtime.shutdown();
});

test("runtime mock: escenario replan añade tareas", async () => {
  const runtime = await Runtime.create({ mock: true, scenario: "replan" });

  const draft = await runtime.createProject({ goal: "x" });
  await runtime.generatePlan(draft.id);
  await waitFor(runtime, draft.id, (status) => status === "ready");

  const initial = await runtime.getProject(draft.id);
  const initialCount = initial.tasks.length;

  await runtime.run(draft.id);
  await waitFor(runtime, draft.id, (status) => status === "completed");

  const completed = await runtime.getProject(draft.id);
  assert.ok(completed.tasks.length > initialCount);

  const events = await runtime.listEvents(draft.id);
  assert.ok(events.some((event) => event.type === "supervisor.replan"));

  await runtime.shutdown();
});

test("runtime mock: pause y resume", async () => {
  const runtime = await Runtime.create({ mock: true, mockDelayMs: 80 });

  const draft = await runtime.createProject({ goal: "x" });
  await runtime.generatePlan(draft.id);
  await waitFor(runtime, draft.id, (status) => status === "ready");

  await runtime.run(draft.id);
  await new Promise((resolve) => setTimeout(resolve, 40));
  await runtime.pause(draft.id);

  await waitFor(runtime, draft.id, (status) => status === "paused");
  const paused = await runtime.getProject(draft.id);
  assert.equal(paused.status, "paused");

  await runtime.resume(draft.id);
  await waitFor(runtime, draft.id, (status) => status === "completed");

  await runtime.shutdown();
});

test("runtime mock: edición del plan valida el DAG", async () => {
  const runtime = await Runtime.create({ mock: true });

  const draft = await runtime.createProject({ goal: "x" });
  await runtime.generatePlan(draft.id);
  await waitFor(runtime, draft.id, (status) => status === "ready");

  const ready = await runtime.getProject(draft.id);
  const first = ready.tasks[0];
  assert.ok(first);

  const updated = await runtime.updateTask(draft.id, first.id, {
    title: "título editado",
  });
  assert.ok(updated.tasks.some((task) => task.title === "título editado"));

  await assert.rejects(
    () =>
      runtime.updateTask(draft.id, first.id, {
        dependsOn: [first.id],
      }),
    /circular/,
  );

  await runtime.shutdown();
});

test("api server: flujo HTTP básico con modo mock", async () => {
  const runtime = await Runtime.create({ mock: true });
  const server = buildApiServer(runtime);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;

  const info = await (await fetch(`${base}/api/info`)).json();
  assert.equal(info.mock, true);

  const created = await (
    await fetch(`${base}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: "librería TS" }),
    })
  ).json();
  assert.equal(created.status, "draft");

  await fetch(`${base}/api/projects/${created.id}/plan`, { method: "POST" });
  await waitFor(runtime, created.id, (status) => status === "ready");

  await fetch(`${base}/api/projects/${created.id}/run`, { method: "POST" });
  await waitFor(runtime, created.id, (status) => status === "completed");

  const list = await (await fetch(`${base}/api/projects`)).json();
  assert.equal(list.length, 1);
  assert.equal(list[0].status, "completed");

  const events = await (
    await fetch(`${base}/api/projects/${created.id}/events`)
  ).json();
  assert.ok(Array.isArray(events) && events.length > 0);

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await runtime.shutdown();
});

test("api server: stream SSE emite eventos", async () => {
  const runtime = await Runtime.create({ mock: true });
  const server = buildApiServer(runtime);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;

  const created = await (
    await fetch(`${base}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: "librería TS" }),
    })
  ).json();

  const received: string[] = [];

  const stream = await fetch(`${base}/api/projects/${created.id}/stream`);
  assert.ok(stream.body);

  const reader = stream.body.getReader();
  const decoder = new TextDecoder();

  const reading = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split("\n")) {
        if (line.startsWith("data: ")) {
          const data = JSON.parse(line.slice(6));
          if (data && typeof data.type === "string") {
            received.push(data.type);
          }
        }
      }
    }
  })();

  await fetch(`${base}/api/projects/${created.id}/plan`, { method: "POST" });
  await waitFor(runtime, created.id, (status) => status === "ready");

  await new Promise((resolve) => setTimeout(resolve, 200));
  await reader.cancel();
  await reading;

  assert.ok(received.includes("plan.started"));
  assert.ok(received.includes("plan.generated"));

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await runtime.shutdown();
});

test("storage: listReviews y listSupervisorRuns persisten", async () => {
  const runtime = await Runtime.create({ mock: true });

  const draft = await runtime.createProject({ goal: "x" });
  await runtime.generatePlan(draft.id);
  await waitFor(runtime, draft.id, (status) => status === "ready");
  await runtime.run(draft.id);
  await waitFor(runtime, draft.id, (status) => status === "completed");

  const reviews = await runtime.listReviews(draft.id);
  assert.ok(reviews.length > 0);
  assert.ok(reviews.every((review) => review.approved));

  await runtime.shutdown();
});

test("runtime mock: cancel deja el proyecto cancelled", async () => {
  const runtime = await Runtime.create({ mock: true, mockDelayMs: 80 });

  const draft = await runtime.createProject({ goal: "x" });
  await runtime.generatePlan(draft.id);
  await waitFor(runtime, draft.id, (status) => status === "ready");

  await runtime.run(draft.id);
  await new Promise((resolve) => setTimeout(resolve, 40));
  await runtime.cancel(draft.id);

  await waitFor(runtime, draft.id, (status) => status === "cancelled");
  const cancelled = await runtime.getProject(draft.id);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.resultBranch, undefined);

  const events = await runtime.listEvents(draft.id);
  assert.ok(events.some((event) => event.type === "project.cancelled"));

  await runtime.shutdown();
});

test("runtime: config por proyecto se persiste y se expone", async () => {
  const runtime = await Runtime.create({ mock: true });

  const draft = await runtime.createProject(
    { goal: "x" },
    { concurrency: 4, maxRetriesPerAgent: 3 },
  );

  assert.equal(draft.config?.concurrency, 4);
  assert.equal(draft.config?.maxRetriesPerAgent, 3);

  const reloaded = await runtime.getProject(draft.id);
  assert.equal(reloaded.config?.concurrency, 4);

  await runtime.shutdown();
});

test("runtime: updateProjectConfig persiste y se expone", async () => {
  const runtime = await Runtime.create({ mock: true });

  const draft = await runtime.createProject({ goal: "x" }, { concurrency: 4 });
  assert.equal(draft.config?.concurrency, 4);

  const updated = await runtime.updateProjectConfig(draft.id, {
    plannerAgent: { provider: "deepseek", model: "deepseek-flash" },
  });

  assert.equal(updated.config?.concurrency, 4);
  assert.equal(updated.config?.plannerAgent.provider, "deepseek");

  const reloaded = await runtime.getProject(draft.id);
  assert.equal(reloaded.config?.plannerAgent.provider, "deepseek");

  const events = await runtime.listEvents(draft.id);
  assert.ok(events.some((event) => event.type === "project.config_updated"));

  await runtime.shutdown();
});

test("api server: PATCH /api/projects/:id/config actualiza los modelos", async () => {
  const runtime = await Runtime.create({ mock: true });
  const server = buildApiServer(runtime);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;

  const created = await (
    await fetch(`${base}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: "x" }),
    })
  ).json();

  const response = await fetch(`${base}/api/projects/${created.id}/config`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plannerAgent: "deepseek", concurrency: 3 }),
  });
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.config.concurrency, 3);
  assert.equal(body.config.plannerAgent.provider, "deepseek");

  const invalid = await fetch(`${base}/api/projects/${created.id}/config`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plannerAgent: "auto" }),
  });
  assert.equal(invalid.status, 400);

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await runtime.shutdown();
});

