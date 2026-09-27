import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { AgentCandidate } from "../agents/types.js";
import type { RunOptions } from "../providers/types.js";
import type { ProjectEvent } from "../storage/types.js";
import { roleExecutor, Runtime } from "./runtime.js";
import { buildApiServer } from "./server.js";

function git(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

async function createFinalRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mrrobot-api-import-"));

  await git(["init", "-b", "main"], dir);
  await git(["config", "user.email", "test@example.com"], dir);
  await git(["config", "user.name", "Test"], dir);
  await writeFile(join(dir, "README.md"), "# base\n", "utf8");
  await git(["add", "-A"], dir);
  await git(["commit", "-m", "chore: initial commit"], dir);

  await git(["checkout", "-b", "agent/project-proj-999-final"], dir);
  await writeFile(join(dir, "index.html"), "<h1>app</h1>", "utf8");
  await git(["add", "-A"], dir);
  await git(["commit", "-m", "agent(TASK-001): Scaffold"], dir);

  return realpath(dir);
}

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

test("runtime mock: con autoRun el plan se ejecuta sin esperar a run()", async () => {
  const runtime = await Runtime.create({ mock: true });

  const draft = await runtime.createProject(
    { goal: "librería TS con sum" },
    { autoRun: true },
  );
  assert.equal(draft.config?.autoRun, true);

  await runtime.generatePlan(draft.id);
  await waitFor(runtime, draft.id, (status) => status === "completed");

  const events = await runtime.listEvents(draft.id);
  assert.ok(events.some((event) => event.type === "project.started"));

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

test("runtime mock: instrucciones a una tarea fallida responden y se registran", async () => {
  const runtime = await Runtime.create({ mock: true, scenario: "fail" });

  const draft = await runtime.createProject({ goal: "x" });
  await runtime.generatePlan(draft.id);
  await waitFor(runtime, draft.id, (status) => status === "ready");
  await runtime.run(draft.id);
  await waitFor(runtime, draft.id, (status) => status === "failed");

  const failed = await runtime.getProject(draft.id);
  const failedTask = failed.tasks.find((task) => task.status === "failed");
  assert.ok(failedTask);

  const outcome = await runtime.sendTaskInstructions(
    draft.id,
    failedTask.id,
    "cambia el enfoque",
  );

  assert.equal(outcome.action, "proceed");
  assert.ok(outcome.reply.length > 0);

  const events = await runtime.listEvents(draft.id);
  const types = events.map((event) => event.type);
  assert.ok(types.includes("task.instruction"));
  assert.ok(types.includes("task.instruction_reply"));

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

test("roleExecutor corre en el repo del proyecto y en solo lectura", async () => {
  const calls: Array<{ agent: AgentCandidate; options: RunOptions | undefined }> =
    [];

  const execute = async (
    _prompt: string,
    agent: AgentCandidate,
    options?: RunOptions,
  ): Promise<string> => {
    calls.push({ agent, options });
    return "ok";
  };

  const run = roleExecutor("/repo/proyecto", execute);
  await run("prompt", { provider: "codex" });

  assert.deepEqual(calls[0]?.options, {
    cwd: "/repo/proyecto",
    sandbox: "read-only",
  });
});

test("roleExecutor sin repo no fija cwd", async () => {
  const calls: Array<{ options: RunOptions | undefined }> = [];

  const execute = async (
    _prompt: string,
    _agent: AgentCandidate,
    options?: RunOptions,
  ): Promise<string> => {
    calls.push({ options });
    return "ok";
  };

  await roleExecutor(undefined, execute)("prompt", { provider: "claude" });

  assert.deepEqual(calls[0]?.options, { sandbox: "read-only" });
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
      body: JSON.stringify({
        goal: "librería TS",
        name: "Mi librería",
        icon: "rocket",
      }),
    })
  ).json();
  assert.equal(created.status, "draft");
  assert.equal(created.name, "Mi librería");
  assert.equal(created.icon, "rocket");

  const brief = {
    rounds: [{ message: "¿Qué runtime?", answer: "Q1 (Runtime): Node" }],
    summary: "- Librería TS para Node",
  };
  await fetch(`${base}/api/projects/${created.id}/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instructions: "Requisitos acordados", brief }),
  });
  await waitFor(runtime, created.id, (status) => status === "ready");

  await fetch(`${base}/api/projects/${created.id}/run`, { method: "POST" });
  await waitFor(runtime, created.id, (status) => status === "completed");

  const list = await (await fetch(`${base}/api/projects`)).json();
  assert.equal(list.length, 1);
  assert.equal(list[0].status, "completed");
  assert.equal(list[0].icon, "rocket");
  // La entrevista inicial sobrevive a la ejecución: el hilo la sigue mostrando.
  const detail = await (
    await fetch(`${base}/api/projects/${created.id}`)
  ).json();
  assert.deepEqual(detail.brief, brief);

  const events = await (
    await fetch(`${base}/api/projects/${created.id}/events`)
  ).json();
  assert.ok(Array.isArray(events) && events.length > 0);

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await runtime.shutdown();
});

test("api server: crea y lista proyectos del usuario (spaces)", async () => {
  const runtime = await Runtime.create({ mock: true });
  const server = buildApiServer(runtime);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;

  const post = (body: unknown) =>
    fetch(`${base}/api/spaces`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const created = await post({
    name: " Recetas ",
    icon: "palette",
    path: "/proyectos/recetas",
  });
  assert.equal(created.status, 201);
  const space = await created.json();
  assert.equal(space.name, "Recetas");
  assert.equal(space.icon, "palette");
  assert.equal(space.path, "/proyectos/recetas");

  const relative = await post({ name: "x", path: "relativa" });
  assert.equal(relative.status, 400);
  const badIcon = await post({ name: "x", icon: "<svg>", path: "/x" });
  assert.equal(badIcon.status, 400);

  const list = await (await fetch(`${base}/api/spaces`)).json();
  assert.deepEqual(list, [space]);

  const removed = await fetch(`${base}/api/spaces/${space.id}`, {
    method: "DELETE",
  });
  assert.equal(removed.status, 200);
  assert.deepEqual(await (await fetch(`${base}/api/spaces`)).json(), []);
  const again = await fetch(`${base}/api/spaces/${space.id}`, {
    method: "DELETE",
  });
  assert.equal(again.status, 404);

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await runtime.shutdown();
});

test("api server: POST /api/grill devuelve la entrevista en modo mock", async () => {
  const runtime = await Runtime.create({ mock: true });
  const server = buildApiServer(runtime);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;

  const response = await fetch(`${base}/api/grill`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ goal: "una calculadora", messages: [] }),
  });
  assert.equal(response.status, 200);

  const grill = await response.json();
  assert.equal(grill.status, "questions");
  assert.ok(Array.isArray(grill.questions) && grill.questions.length > 0);

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await runtime.shutdown();
});

test("api server: importa un proyecto completado desde una rama final", async () => {
  const runtime = await Runtime.create({ mock: true });
  const server = buildApiServer(runtime);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;

  const repoPath = await createFinalRepo();

  const branches = await (
    await fetch(
      `${base}/api/projects/import/branches?repoPath=${encodeURIComponent(repoPath)}`,
    )
  ).json();
  assert.deepEqual(branches.branches, ["agent/project-proj-999-final"]);

  const imported = await (
    await fetch(`${base}/api/projects/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoPath, name: "Importada" }),
    })
  ).json();

  assert.equal(imported.status, "completed");
  assert.equal(imported.name, "Importada");
  assert.equal(imported.resultBranch, "agent/project-proj-999-final");
  assert.equal(imported.stats.done, 1);

  const fetched = await (
    await fetch(`${base}/api/projects/${imported.id}`)
  ).json();
  assert.equal(fetched.status, "completed");

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await runtime.shutdown();
});

test("api server: preview expone estado y se detiene", async () => {
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
      body: JSON.stringify({ goal: "web app" }),
    })
  ).json();

  const idle = await (
    await fetch(`${base}/api/projects/${created.id}/preview`)
  ).json();
  assert.equal(idle.status, "stopped");

  await fetch(`${base}/api/projects/${created.id}/plan`, { method: "POST" });
  await waitFor(runtime, created.id, (status) => status === "ready");
  await fetch(`${base}/api/projects/${created.id}/run`, { method: "POST" });
  await waitFor(runtime, created.id, (status) => status === "completed");

  const started = await (
    await fetch(`${base}/api/projects/${created.id}/preview`, {
      method: "POST",
    })
  ).json();
  assert.equal(started.status, "starting");

  const stopped = await (
    await fetch(`${base}/api/projects/${created.id}/preview`, {
      method: "DELETE",
    })
  ).json();
  assert.equal(stopped.status, "stopped");

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

test("api server: DELETE /api/projects/:id borra el proyecto", async () => {
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

  const response = await fetch(`${base}/api/projects/${created.id}`, {
    method: "DELETE",
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.deleted, true);

  const list = await (await fetch(`${base}/api/projects`)).json();
  assert.equal(list.length, 0);

  const missing = await fetch(`${base}/api/projects/${created.id}`);
  assert.equal(missing.status, 404);

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
    maxReviewFixCycles: 5,
  });

  assert.equal(updated.config?.concurrency, 4);
  assert.equal(updated.config?.maxReviewFixCycles, 5);

  const reloaded = await runtime.getProject(draft.id);
  assert.equal(reloaded.config?.maxReviewFixCycles, 5);

  const events = await runtime.listEvents(draft.id);
  assert.ok(events.some((event) => event.type === "project.config_updated"));

  await runtime.shutdown();
});

test("api server: PATCH /api/projects/:id/config actualiza la config", async () => {
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
    body: JSON.stringify({ maxReviewFixCycles: 5, concurrency: 3 }),
  });
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.config.concurrency, 3);
  assert.equal(body.config.maxReviewFixCycles, 5);

  const invalid = await fetch(`${base}/api/projects/${created.id}/config`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ concurrency: 0 }),
  });
  assert.equal(invalid.status, 400);

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await runtime.shutdown();
});

test("api server: chats generan tareas y se pueden iterar", async () => {
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

  const chat = await (
    await fetch(`${base}/api/projects/${created.id}/chats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "añade login" }),
    })
  ).json();

  assert.equal(chat.title, "añade login");
  assert.ok(chat.taskIds.length > 0);
  assert.ok(chat.messages.length >= 2);

  const chats = await (
    await fetch(`${base}/api/projects/${created.id}/chats`)
  ).json();
  assert.equal(chats.length, 1);

  const sent = await (
    await fetch(`${base}/api/projects/${created.id}/chats/${chat.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "y también logout" }),
    })
  ).json();
  assert.ok(sent.messages.length >= 3);

  const project = await (
    await fetch(`${base}/api/projects/${created.id}`)
  ).json();
  assert.equal(project.status, "ready");
  assert.ok(project.tasks.every((task: { chatId?: string }) => task.chatId));

  const deleted = await (
    await fetch(`${base}/api/projects/${created.id}/chats/${chat.id}`, {
      method: "DELETE",
    })
  ).json();
  assert.equal(deleted.deleted, true);

  const remaining = await (
    await fetch(`${base}/api/projects/${created.id}/chats`)
  ).json();
  assert.equal(remaining.length, 0);

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await runtime.shutdown();
});

test("api server: GET /api/chats lista los chats de todos los proyectos", async () => {
  const runtime = await Runtime.create({ mock: true });
  const server = buildApiServer(runtime);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;

  const first = await (
    await fetch(`${base}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: "uno" }),
    })
  ).json();
  const second = await (
    await fetch(`${base}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: "dos" }),
    })
  ).json();

  const chat = await (
    await fetch(`${base}/api/projects/${first.id}/chats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
  ).json();

  const chats = await (await fetch(`${base}/api/chats`)).json();
  assert.equal(chats.length, 1);
  assert.equal(chats[0].id, chat.id);
  assert.equal(chats[0].projectId, first.id);
  assert.equal(chats[0].title, "Chat 1");

  await fetch(`${base}/api/projects/${second.id}/chats`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "en el segundo" }),
  });

  const all = await (await fetch(`${base}/api/chats`)).json();
  assert.equal(all.length, 2);
  assert.ok(all.some((item: { projectId: string }) => item.projectId === second.id));

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await runtime.shutdown();
});


async function startMockServer() {
  const runtime = await Runtime.create({ mock: true });
  const server = buildApiServer(runtime);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  const call = async (path: string, method = "GET", body?: unknown) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  };
  const stop = async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await runtime.shutdown();
  };
  return { call, stop };
}

test("api server: chat suelto sin proyecto conversa y se mueve a un proyecto", async () => {
  const { call, stop } = await startMockServer();

  const created = await call("/api/chats", "POST", { message: "idea: una app de notas" });
  assert.equal(created.status, 201);
  const chat = created.body;
  assert.equal(chat.projectId, undefined);
  assert.equal(chat.title, "idea: una app de notas");
  assert.equal(chat.messages.length, 2);
  assert.match(chat.messages[1].content, /Recibido: idea: una app de notas/);
  assert.deepEqual(chat.taskIds, []);

  const sent = await call(`/api/chats/${chat.id}/messages`, "POST", { content: "con tags" });
  assert.equal(sent.body.messages.length, 4);

  const project = (await call("/api/projects", "POST", { goal: "notas" })).body;
  const moved = await call(`/api/chats/${chat.id}`, "PATCH", { projectId: project.id });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.projectId, project.id);
  assert.ok(moved.body.messages.every((m: { projectId?: string }) => m.projectId === project.id));

  const projectChats = (await call(`/api/projects/${project.id}/chats`)).body;
  assert.equal(projectChats.length, 1);

  // Ya en el proyecto, un mensaje pasa por el planner y genera tareas.
  const planned = await call(`/api/chats/${chat.id}/messages`, "POST", { content: "hazlo" });
  assert.ok(planned.body.taskIds.length > 0);

  // Con tareas ya no se puede sacar del proyecto.
  const refused = await call(`/api/chats/${chat.id}`, "PATCH", { projectId: null });
  assert.equal(refused.status, 409);
  assert.match(refused.body.error, /No se puede mover/);

  await stop();
});

test("api server: renombrar, fijar y archivar chats y proyectos", async () => {
  const { call, stop } = await startMockServer();

  const untitled = (await call("/api/chats", "POST", {})).body;
  assert.equal(untitled.title, "Nuevo chat");
  // El primer mensaje le da nombre.
  const named = await call(`/api/chats/${untitled.id}/messages`, "POST", { content: "Plan de viaje\ncon detalles" });
  assert.equal(named.body.title, "Plan de viaje");
  const chat = untitled;

  const renamed = await call(`/api/chats/${chat.id}`, "PATCH", { title: "  Ideas  " });
  assert.equal(renamed.body.title, "Ideas");

  const pinned = await call(`/api/chats/${chat.id}`, "PATCH", { pinned: true });
  assert.equal(pinned.body.pinned, true);

  const archived = await call(`/api/chats/${chat.id}`, "PATCH", { archived: true });
  assert.ok(archived.body.archivedAt);
  const unarchived = await call(`/api/chats/${chat.id}`, "PATCH", { archived: false });
  assert.equal(unarchived.body.archivedAt, undefined);

  const empty = await call(`/api/chats/${chat.id}`, "PATCH", {});
  assert.equal(empty.status, 400);

  const project = (await call("/api/projects", "POST", { goal: "tienda" })).body;
  const patched = await call(`/api/projects/${project.id}`, "PATCH", {
    title: "Mi tienda",
    pinned: true,
    archived: true,
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.title, "Mi tienda");
  assert.equal(patched.body.pinned, true);
  assert.ok(patched.body.archivedAt);

  const listed = (await call("/api/projects")).body;
  assert.equal(listed[0].title, "Mi tienda");

  const cleared = await call(`/api/projects/${project.id}`, "PATCH", { title: null });
  assert.equal(cleared.body.title, undefined);

  const deleted = await call(`/api/chats/${chat.id}`, "DELETE");
  assert.equal(deleted.body.deleted, true);
  const missing = await call(`/api/chats/${chat.id}`);
  assert.equal(missing.status, 404);

  await stop();
});

test("api server: la búsqueda encuentra chats por contenido con fragmento", async () => {
  const { call, stop } = await startMockServer();

  const chat = (await call("/api/chats", "POST", { title: "Varios", message: "hablemos de pagos con Stripe" })).body;
  const archived = (await call("/api/chats", "POST", { message: "Stripe archivado" })).body;
  await call(`/api/chats/${archived.id}`, "PATCH", { archived: true });

  const results = (await call("/api/search?q=stripe")).body;
  assert.equal(results.chats.length, 1);
  assert.equal(results.chats[0].id, chat.id);
  assert.match(results.chats[0].snippet, /Stripe/);
  assert.equal(results.chats[0].projectId, undefined);

  await stop();
});

test("api server: los agentes del proyecto y los adjuntos llegan al cliente", async () => {
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
      body: JSON.stringify({
        goal: "librería TS",
        defaultAllowedAgents: [
          { provider: "codex" },
          { provider: "claude", model: "opus" },
        ],
      }),
    })
  ).json();

  assert.deepEqual(created.defaultAllowedAgents, [
    { provider: "codex" },
    { provider: "claude", model: "opus" },
  ]);

  // Un chat nuevo hereda los agentes elegidos al crear el proyecto.
  const chat = await (
    await fetch(`${base}/api/projects/${created.id}/chats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
  ).json();

  assert.deepEqual(chat.allowedAgents, [
    { provider: "codex" },
    { provider: "claude", model: "opus" },
  ]);

  // Y los adjuntos del mensaje vuelven serializados.
  const detail = await (
    await fetch(`${base}/api/projects/${created.id}/chats/${chat.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "mira la especificación",
        attachments: [
          {
            name: "spec.md",
            type: "markdown",
            mimeType: "text/markdown",
            size: 6,
            data: "IyBIb2xh",
          },
        ],
      }),
    })
  ).json();

  const userMessage = detail.messages.find(
    (message: { role: string }) => message.role === "user",
  );
  assert.equal(userMessage.attachments?.length, 1);
  assert.equal(userMessage.attachments[0].name, "spec.md");

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await runtime.shutdown();
});

test("api server: acepta una selección de solo DeepSeek (escribe con el harness)", async () => {
  const runtime = await Runtime.create({ mock: true });
  const server = buildApiServer(runtime);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;

  const response = await fetch(`${base}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      goal: "crear algo",
      defaultAllowedAgents: [
        { provider: "deepseek", model: "deepseek-flash" },
      ],
    }),
  });

  assert.equal(response.status, 201);
  const body = (await response.json()) as {
    defaultAllowedAgents?: unknown;
  };
  assert.deepEqual(body.defaultAllowedAgents, [
    { provider: "deepseek", model: "deepseek-flash" },
  ]);

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await runtime.shutdown();
});

test("api server: GET /api/agents/matrix coincide con selectAgent", async () => {
  const runtime = await Runtime.create({ mock: true });
  const server = buildApiServer(runtime);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;

  const matrix = await (await fetch(`${base}/api/agents/matrix`)).json();
  assert.equal(matrix.length, 6);

  const coding = matrix.find((row: { type: string }) => row.type === "coding");
  assert.deepEqual(coding.agents.low, {
    provider: "claude",
    model: "haiku",
  });
  assert.deepEqual(coding.agents.high, {
    provider: "claude",
    model: "haiku",
  });

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await runtime.shutdown();
});

test("api server: POST /api/agents/fallback-chain refleja getFallbackChain", async () => {
  const runtime = await Runtime.create({ mock: true });
  const server = buildApiServer(runtime);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;

  const chain = await (
    await fetch(`${base}/api/agents/fallback-chain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "coding", complexity: "low" }),
    })
  ).json();

  assert.deepEqual(chain, [
    { provider: "claude", model: "haiku" },
    { provider: "codex" },
    { provider: "claude", model: "sonnet" },
    { provider: "deepseek", model: "deepseek-flash" },
  ]);

  const restricted = await (
    await fetch(`${base}/api/agents/fallback-chain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "coding",
        complexity: "high",
        allowedAgents: [{ provider: "claude", model: "sonnet" }, { provider: "codex" }],
      }),
    })
  ).json();

  assert.deepEqual(restricted, [
    { provider: "codex" },
    { provider: "claude", model: "sonnet" },
  ]);

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await runtime.shutdown();
});

test("api server: GET /api/search encuentra chats y tareas de todos los proyectos", async () => {
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
      body: JSON.stringify({ goal: "librería TS con login" }),
    })
  ).json();

  await fetch(`${base}/api/projects/${created.id}/chats`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "añade login" }),
  });

  await waitFor(runtime, created.id, (status) => status === "ready");

  const empty = await (await fetch(`${base}/api/search?q=`)).json();
  assert.deepEqual(empty, { chats: [], tasks: [] });

  const results = await (
    await fetch(`${base}/api/search?q=${encodeURIComponent("login")}`)
  ).json();

  assert.ok(results.chats.length > 0);
  assert.equal(results.chats[0].projectId, created.id);
  assert.equal(results.chats[0].projectName, created.name);

  const project = await (
    await fetch(`${base}/api/projects/${created.id}`)
  ).json();
  const byTitle = project.tasks.find((task: { title: string }) =>
    task.title.toLowerCase().includes("login"),
  );

  if (byTitle) {
    const taskResults = await (
      await fetch(`${base}/api/search?q=${encodeURIComponent(byTitle.title)}`)
    ).json();
    assert.ok(
      taskResults.tasks.some((task: { id: string }) => task.id === byTitle.id),
    );
  }

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await runtime.shutdown();
});
