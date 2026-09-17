import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { ProjectEvent } from "../storage/types.js";
import {
  parseChatInput,
  parseChatMessage,
  parseConfigOverrides,
  parseImportProject,
  parseNewTask,
  parseRepoOptions,
  parseTaskPatch,
} from "./parse.js";
import { pickFolder } from "./pick-folder.js";
import {
  ProjectNotFoundError,
  Runtime,
  type RuntimeOptions,
} from "./runtime.js";
import { serializeEvent } from "./serialize.js";

const MAX_BODY_BYTES = 1024 * 1024;

interface RequestContext {
  req: IncomingMessage;
  res: ServerResponse;
  segments: string[];
  query: URLSearchParams;
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function corsHeaders(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Cuerpo de petición demasiado grande."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }

      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(JSON.parse(raw) as Record<string, unknown>);
      } catch {
        reject(new Error("JSON inválido en el cuerpo de la petición."));
      }
    });

    req.on("error", reject);
  });
}

function writeSse(res: ServerResponse, data: unknown): void {
  res.write(`event: message\n`);
  res.write(`id: ${Date.now()}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function handleStream(
  runtime: Runtime,
  res: ServerResponse,
  req: IncomingMessage,
  projectId: string,
): Promise<void> {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  writeSse(res, { type: "connected", projectId });

  const unsubscribe = runtime.subscribe((event: ProjectEvent) => {
    if (event.projectId !== projectId) return;
    writeSse(res, serializeEvent(event));
  });

  const heartbeat = setInterval(() => {
    res.write(`: ping\n\n`);
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}

async function dispatch(
  runtime: Runtime,
  ctx: RequestContext,
): Promise<void> {
  const { req, res, segments, query } = ctx;

  // /api/health
  if (req.method === "GET" && segments[1] === "health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  // /api/info
  if (req.method === "GET" && segments[1] === "info") {
    sendJson(res, 200, await runtime.info());
    return;
  }

  // /api/config
  if (req.method === "PUT" && segments[1] === "config") {
    const body = await readJson(req);
    sendJson(res, 200, runtime.updateConfig(parseConfigOverrides(body)));
    return;
  }

  // /api/fs/pick-folder
  if (
    req.method === "POST" &&
    segments[1] === "fs" &&
    segments[2] === "pick-folder"
  ) {
    sendJson(res, 200, { path: await pickFolder() });
    return;
  }

  // /api/activity
  if (req.method === "GET" && segments[1] === "activity") {
    const limit = Number(query.get("limit") ?? "100");
    sendJson(res, 200, await runtime.activity(Number.isFinite(limit) ? limit : 100));
    return;
  }

  // /api/chats
  if (req.method === "GET" && segments[1] === "chats") {
    sendJson(res, 200, await runtime.listAllChats());
    return;
  }

  // /api/projects
  if (segments[1] === "projects") {
    if (req.method === "GET" && segments.length === 2) {
      sendJson(res, 200, await runtime.listProjects());
      return;
    }

    if (req.method === "POST" && segments.length === 2) {
      const body = await readJson(req);
      const goal = typeof body["goal"] === "string" ? body["goal"].trim() : "";

      if (!goal) {
        sendJson(res, 400, { error: "El objetivo del proyecto es obligatorio." });
        return;
      }

      const name =
        typeof body["name"] === "string" && body["name"].trim()
          ? body["name"].trim()
          : undefined;
      const configBody = body["config"];
      const config =
        configBody && typeof configBody === "object" && !Array.isArray(configBody)
          ? parseConfigOverrides(configBody as Record<string, unknown>)
          : {};

      const repo = parseRepoOptions(body);

      const project = await runtime.createProject(
        { goal, ...(name ? { name } : {}), ...repo },
        config,
      );
      sendJson(res, 201, project);
      return;
    }

    // /api/projects/import
    if (req.method === "POST" && segments.length === 3 && segments[2] === "import") {
      const body = await readJson(req);
      sendJson(res, 201, await runtime.importProject(parseImportProject(body)));
      return;
    }

    // /api/projects/import/branches
    if (
      req.method === "GET" &&
      segments.length === 4 &&
      segments[2] === "import" &&
      segments[3] === "branches"
    ) {
      const repoPath = query.get("repoPath");
      sendJson(res, 200, {
        branches: await runtime.listFinalBranches(repoPath ?? ""),
      });
      return;
    }

    const projectId = segments[2];
    if (!projectId) {
      sendJson(res, 404, { error: "Ruta no encontrada." });
      return;
    }

    // /api/projects/:id
    if (req.method === "GET" && segments.length === 3) {
      sendJson(res, 200, await runtime.getProject(projectId));
      return;
    }

    // /api/projects/:id
    if (req.method === "DELETE" && segments.length === 3) {
      sendJson(res, 200, await runtime.deleteProject(projectId));
      return;
    }

    // /api/projects/:id/config
    if (req.method === "PATCH" && segments[3] === "config") {
      const body = await readJson(req);
      sendJson(
        res,
        200,
        await runtime.updateProjectConfig(projectId, parseConfigOverrides(body)),
      );
      return;
    }

    // /api/projects/:id/plan
    if (req.method === "POST" && segments[3] === "plan") {
      sendJson(res, 202, await runtime.generatePlan(projectId));
      return;
    }

    // /api/projects/:id/run
    if (req.method === "POST" && segments[3] === "run") {
      sendJson(res, 202, await runtime.run(projectId));
      return;
    }

    // /api/projects/:id/pause
    if (req.method === "POST" && segments[3] === "pause") {
      sendJson(res, 200, await runtime.pause(projectId));
      return;
    }

    // /api/projects/:id/resume
    if (req.method === "POST" && segments[3] === "resume") {
      sendJson(res, 202, await runtime.resume(projectId));
      return;
    }

    // /api/projects/:id/cancel
    if (req.method === "POST" && segments[3] === "cancel") {
      sendJson(res, 200, await runtime.cancel(projectId));
      return;
    }

    // /api/projects/:id/tasks
    if (req.method === "GET" && segments[3] === "tasks") {
      const project = await runtime.getProject(projectId);
      sendJson(res, 200, project.tasks);
      return;
    }

    // /api/projects/:id/events
    if (req.method === "GET" && segments[3] === "events") {
      sendJson(res, 200, await runtime.listEvents(projectId));
      return;
    }

    // /api/projects/:id/reviews
    if (req.method === "GET" && segments[3] === "reviews") {
      sendJson(res, 200, await runtime.listReviews(projectId));
      return;
    }

    // /api/projects/:id/supervisor
    if (req.method === "GET" && segments[3] === "supervisor") {
      sendJson(res, 200, await runtime.listSupervisorRuns(projectId));
      return;
    }

    // /api/projects/:id/chats
    if (segments[3] === "chats") {
      if (req.method === "GET" && segments.length === 4) {
        sendJson(res, 200, await runtime.listChats(projectId));
        return;
      }

      if (req.method === "POST" && segments.length === 4) {
        const body = await readJson(req);
        sendJson(res, 201, await runtime.createChat(projectId, parseChatInput(body)));
        return;
      }

      const chatId = segments[4];

      if (chatId && segments.length === 5) {
        if (req.method === "GET") {
          sendJson(res, 200, await runtime.getChat(projectId, chatId));
          return;
        }

        if (req.method === "DELETE") {
          sendJson(res, 200, await runtime.deleteChat(projectId, chatId));
          return;
        }
      }

      // /api/projects/:id/chats/:chatId/messages
      if (chatId && req.method === "POST" && segments[5] === "messages") {
        const body = await readJson(req);
        sendJson(
          res,
          200,
          await runtime.sendChatMessage(
            projectId,
            chatId,
            parseChatMessage(body),
          ),
        );
        return;
      }
    }

    // /api/projects/:id/preview
    if (segments[3] === "preview") {
      if (req.method === "GET") {
        sendJson(res, 200, await runtime.getPreview(projectId));
        return;
      }

      if (req.method === "POST") {
        sendJson(res, 202, await runtime.startPreview(projectId));
        return;
      }

      if (req.method === "DELETE") {
        sendJson(res, 200, await runtime.stopPreview(projectId));
        return;
      }
    }

    // /api/projects/:id/stream
    if (req.method === "GET" && segments[3] === "stream") {
      await handleStream(runtime, res, req, projectId);
      return;
    }

    // /api/projects/:id/tasks (POST)
    if (req.method === "POST" && segments[3] === "tasks") {
      const body = await readJson(req);
      const project = await runtime.addTask(projectId, parseNewTask(body));
      sendJson(res, 200, project);
      return;
    }

    // /api/projects/:id/tasks/:taskId
    if (segments[3] === "tasks" && segments[4]) {
      const taskId = segments[4];

      if (req.method === "PATCH") {
        const body = await readJson(req);
        const project = await runtime.updateTask(
          projectId,
          taskId,
          parseTaskPatch(body),
        );
        sendJson(res, 200, project);
        return;
      }

      if (req.method === "DELETE") {
        const project = await runtime.removeTask(projectId, taskId);
        sendJson(res, 200, project);
        return;
      }
    }
  }

  sendJson(res, 404, { error: "Ruta no encontrada." });
}

export function buildApiServer(runtime: Runtime) {
  return createServer(async (req, res) => {
    corsHeaders(res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", "http://localhost");
    const segments = url.pathname.split("/").filter(Boolean);
    const query = url.searchParams;

    if (segments[0] !== "api") {
      sendJson(res, 404, { error: "Ruta no encontrada." });
      return;
    }

    try {
      await dispatch(runtime, { req, res, segments, query });
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        sendJson(res, 404, { error: error.message });
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      const isConflict =
        /ya se está|Solo se puede|No se puede/.test(message);
      const isBadRequest =
        /inválido|obligatorio|desconocido|debe ser|no vacío|no se enviaron|requiere|No se puede/.test(
          message,
        );

      const status = isConflict ? 409 : isBadRequest ? 400 : 500;
      sendJson(res, status, { error: message });
    }
  });
}

export interface StartOptions extends RuntimeOptions {
  port?: number;
  host?: string;
}

export async function startServer(options: StartOptions = {}) {
  const port = options.port ?? 4000;
  const host = options.host ?? "127.0.0.1";

  const runtime = await Runtime.create(options);
  const server = buildApiServer(runtime);

  server.listen(port, host, () => {
    console.log(`MrRobot API escuchando en http://${host}:${port}`);
    if (runtime.isMock()) {
      console.log("Modo mock: agentes y git simulados.");
    }
  });

  const shutdown = async () => {
    server.close();
    await runtime.shutdown();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return { server, runtime };
}

export type { StartOptions as ServerOptions };
