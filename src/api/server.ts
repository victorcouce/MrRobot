import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { ProjectEvent } from "../storage/types.js";
import {
  parseAllowedAgents,
  parseAttachments,
  parseChatInput,
  parseChatMessage,
  parseChatPatch,
  parseProjectPatch,
  parseConfigOverrides,
  parseFallbackChainInput,
  parseGrillInput,
  parseProjectBrief,
  parseImportProject,
  parseNewSpace,
  parseNewTask,
  parseRepoOptions,
  parseTaskPatch,
  parseTaskInstructions,
} from "./parse.js";
import { checkAndApplyDeepSeekKey } from "./deepseek-key.js";
import { checkAndApplyLmStudioConfig } from "./lmstudio-config.js";
import { installCli, isInstallableCliProvider } from "./install-cli.js";
import { checkAndApplyGitHubToken } from "./github-token.js";
import { pickFolder } from "./pick-folder.js";
import { checkFolder, checkRemote } from "../workspace/validate.js";
import {
  ProjectNotFoundError,
  Runtime,
  type RuntimeOptions,
} from "./runtime.js";
import { serializeEvent } from "./serialize.js";

// Los adjuntos viajan en base64 (+33 %): 5 MB de archivos son ~6,7 MB de JSON.
const MAX_BODY_BYTES = 8 * 1024 * 1024;

interface RequestContext {
  req: IncomingMessage;
  res: ServerResponse;
  segments: string[];
  query: URLSearchParams;
  streams: Set<ServerResponse>;
}

/** Milisegundos que el cliente espera antes de reconectar el SSE. */
const SSE_RETRY_MS = 10000;

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
  streams: Set<ServerResponse>,
): Promise<void> {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  // Un reinicio del servidor cierra el stream: esperar antes de reconectar
  // evita que el navegador acumule ERR_CONNECTION_REFUSED mientras arranca.
  res.write(`retry: ${SSE_RETRY_MS}\n\n`);

  writeSse(res, { type: "connected", projectId });

  streams.add(res);

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
    streams.delete(res);
  });
}

async function dispatch(
  runtime: Runtime,
  ctx: RequestContext,
): Promise<void> {
  const { req, res, segments, query, streams } = ctx;

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
    sendJson(res, 200, await runtime.updateConfigFromBody(body));
    return;
  }

  // /api/onboarding/complete
  if (
    req.method === "POST" &&
    segments[1] === "onboarding" &&
    segments[2] === "complete"
  ) {
    sendJson(res, 200, await runtime.completeOnboarding());
    return;
  }

  // /api/github-token
  if (req.method === "POST" && segments[1] === "github-token") {
    const body = await readJson(req);
    const token = body["token"];

    if (typeof token !== "string") {
      sendJson(res, 400, { error: 'El campo "token" es obligatorio.' });
      return;
    }

    sendJson(res, 200, await checkAndApplyGitHubToken(token));
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

  // /api/fs/check-folder
  if (
    req.method === "POST" &&
    segments[1] === "fs" &&
    segments[2] === "check-folder"
  ) {
    const body = await readJson(req);
    const path = body["path"];

    if (typeof path !== "string" || !path.trim()) {
      sendJson(res, 400, { error: 'El campo "path" es obligatorio.' });
      return;
    }

    sendJson(res, 200, await checkFolder(path));
    return;
  }

  // /api/fs/check-remote
  if (
    req.method === "POST" &&
    segments[1] === "fs" &&
    segments[2] === "check-remote"
  ) {
    const body = await readJson(req);
    const url = body["url"];

    if (typeof url !== "string" || !url.trim()) {
      sendJson(res, 400, { error: 'El campo "url" es obligatorio.' });
      return;
    }

    sendJson(res, 200, await checkRemote(url));
    return;
  }

  // /api/agents/deepseek-key
  if (
    req.method === "POST" &&
    segments[1] === "agents" &&
    segments[2] === "deepseek-key"
  ) {
    const body = await readJson(req);
    const apiKey = body["apiKey"];

    if (typeof apiKey !== "string") {
      sendJson(res, 400, { error: 'El campo "apiKey" es obligatorio.' });
      return;
    }

    sendJson(res, 200, await checkAndApplyDeepSeekKey(apiKey));
    return;
  }

  // /api/agents/lmstudio-config
  if (
    req.method === "POST" &&
    segments[1] === "agents" &&
    segments[2] === "lmstudio-config"
  ) {
    const body = await readJson(req);
    const baseUrl = body["baseUrl"];

    if (typeof baseUrl !== "string") {
      sendJson(res, 400, { error: 'El campo "baseUrl" es obligatorio.' });
      return;
    }

    sendJson(res, 200, await checkAndApplyLmStudioConfig(baseUrl));
    return;
  }

  // /api/agents/install
  if (
    req.method === "POST" &&
    segments[1] === "agents" &&
    segments[2] === "install"
  ) {
    const body = await readJson(req);
    const provider = body["provider"];

    if (!isInstallableCliProvider(provider)) {
      sendJson(res, 400, {
        error: 'El campo "provider" debe ser "codex" o "claude".',
      });
      return;
    }

    sendJson(res, 200, await installCli(provider));
    return;
  }

  // /api/agents/matrix
  if (
    req.method === "GET" &&
    segments[1] === "agents" &&
    segments[2] === "matrix"
  ) {
    sendJson(res, 200, runtime.agentMatrix());
    return;
  }

  // /api/agents/fallback-chain
  if (
    req.method === "POST" &&
    segments[1] === "agents" &&
    segments[2] === "fallback-chain"
  ) {
    const body = await readJson(req);
    sendJson(res, 200, runtime.fallbackChain(parseFallbackChainInput(body)));
    return;
  }

  // /api/spaces
  if (segments[1] === "spaces" && segments.length === 2) {
    if (req.method === "GET") {
      sendJson(res, 200, await runtime.listSpaces());
      return;
    }

    if (req.method === "POST") {
      const body = await readJson(req);
      sendJson(res, 201, await runtime.createSpace(parseNewSpace(body)));
      return;
    }
  }

  // /api/spaces/:id
  if (
    req.method === "DELETE" &&
    segments[1] === "spaces" &&
    segments.length === 3
  ) {
    sendJson(res, 200, await runtime.deleteSpace(segments[2] ?? ""));
    return;
  }

  // /api/search
  if (req.method === "GET" && segments[1] === "search") {
    sendJson(res, 200, await runtime.search(query.get("q") ?? ""));
    return;
  }

  // /api/grill
  if (req.method === "POST" && segments[1] === "grill") {
    const body = await readJson(req);
    const input = parseGrillInput(body);
    sendJson(
      res,
      200,
      await runtime.grill(
        input.goal,
        input.messages,
        input.repoPath,
        input.allowedAgents,
        input.projectId,
      ),
    );
    return;
  }

  // /api/activity
  if (req.method === "GET" && segments[1] === "activity") {
    const limit = Number(query.get("limit") ?? "100");
    sendJson(res, 200, await runtime.activity(Number.isFinite(limit) ? limit : 100));
    return;
  }

  // /api/metrics
  if (req.method === "GET" && segments[1] === "metrics") {
    sendJson(res, 200, await runtime.metrics());
    return;
  }

  // /api/chats: todos los chats (de proyecto y sueltos) por id.
  if (segments[1] === "chats") {
    if (req.method === "GET" && segments.length === 2) {
      sendJson(res, 200, await runtime.listAllChats());
      return;
    }

    if (req.method === "POST" && segments.length === 2) {
      const body = await readJson(req);
      const allowedAgents = parseAllowedAgents(body["allowedAgents"]);
      sendJson(
        res,
        201,
        await runtime.createStandaloneChat({
          ...parseChatInput(body),
          ...(allowedAgents.length > 0 ? { allowedAgents } : {}),
        }),
      );
      return;
    }

    const chatId = segments[2];

    if (chatId && segments.length === 3) {
      if (req.method === "GET") {
        sendJson(res, 200, await runtime.getChatById(chatId));
        return;
      }

      if (req.method === "PATCH") {
        const body = await readJson(req);
        sendJson(res, 200, await runtime.updateChat(chatId, parseChatPatch(body)));
        return;
      }

      if (req.method === "DELETE") {
        sendJson(res, 200, await runtime.deleteChatById(chatId));
        return;
      }
    }

    if (chatId && req.method === "POST" && segments[3] === "messages") {
      const body = await readJson(req);
      const parsed = parseChatMessage(body);
      sendJson(
        res,
        200,
        await runtime.sendMessageToChat(chatId, parsed.content, parsed.attachments),
      );
      return;
    }
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
      const icon =
        typeof body["icon"] === "string" && body["icon"].trim()
          ? body["icon"].trim()
          : undefined;
      const configBody = body["config"];
      const config =
        configBody && typeof configBody === "object" && !Array.isArray(configBody)
          ? parseConfigOverrides(configBody as Record<string, unknown>)
          : {};

      const repo = parseRepoOptions(body);
      const defaultAllowedAgents = parseAllowedAgents(body["defaultAllowedAgents"]);
      const attachments = parseAttachments(body["attachments"]);

      const project = await runtime.createProject(
        {
          goal,
          ...(attachments ? { attachments } : {}),
          ...(name ? { name } : {}),
          ...(icon ? { icon } : {}),
          ...repo,
          ...(defaultAllowedAgents.length > 0 ? { defaultAllowedAgents } : {}),
        },
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

    // /api/projects/:id (renombrar, fijar, archivar)
    if (req.method === "PATCH" && segments.length === 3) {
      const body = await readJson(req);
      sendJson(res, 200, await runtime.updateProject(projectId, parseProjectPatch(body)));
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
      const body = await readJson(req);
      const instructions =
        typeof body["instructions"] === "string"
          ? body["instructions"]
          : undefined;
      const brief = parseProjectBrief(body["brief"]);
      sendJson(
        res,
        202,
        await runtime.generatePlan(projectId, instructions, brief),
      );
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
        const parsed = parseChatMessage(body);
        sendJson(
          res,
          200,
          await runtime.sendChatMessage(
            projectId,
            chatId,
            parsed.content,
            parsed.attachments,
          ),
        );
        return;
      }

      // /api/projects/:id/chats/:chatId (PATCH)
      if (chatId && req.method === "PATCH" && segments.length === 5) {
        const body = await readJson(req);
        if ("allowedAgents" in body) {
          const agents = parseAllowedAgents(body["allowedAgents"]);
          sendJson(
            res,
            200,
            await runtime.updateChatAllowedAgents(projectId, chatId, agents),
          );
        } else {
          sendJson(res, 400, { error: "No hay campos para actualizar." });
        }
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
      await handleStream(runtime, res, req, projectId, streams);
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

      if (req.method === "POST" && segments[5] === "instructions") {
        const body = await readJson(req);
        const outcome = await runtime.sendTaskInstructions(
          projectId,
          taskId,
          parseTaskInstructions(body),
        );
        sendJson(res, 200, outcome);
        return;
      }
    }
  }

  sendJson(res, 404, { error: "Ruta no encontrada." });
}

export function buildApiServer(
  runtime: Runtime,
  streams: Set<ServerResponse> = new Set(),
) {
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
      await dispatch(runtime, { req, res, segments, query, streams });
    } catch (error) {
      // Si ya se enviaron cabeceras (p. ej. un SSE que falla a mitad), no se
      // puede responder con JSON: cerrar la conexión sin tumbar el proceso.
      if (res.headersSent) {
        res.destroy();
        return;
      }

      if (
        error instanceof ProjectNotFoundError ||
        (error instanceof Error && /^Chat .* no encontrado\.$/.test(error.message))
      ) {
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
  const streams = new Set<ServerResponse>();
  const server = buildApiServer(runtime, streams);

  // Antes de aceptar peticiones: los estados transitorios de una ejecución
  // anterior no deben quedar colgados como si siguieran en marcha. Los que
  // estaban `running` se reanudan solos (MRROBOT_AUTO_RESUME=0 lo desactiva).
  const autoResume = process.env.MRROBOT_AUTO_RESUME !== "0";
  const recovered = await runtime.recoverInterruptedProjects({ autoResume });
  if (recovered.length > 0) {
    console.log(
      `Recuperados ${recovered.length} proyecto(s) interrumpido(s)` +
        (autoResume ? "; reanudando los que estaban en marcha." : "."),
    );
  }

  server.listen(port, host, () => {
    console.log(`MrRobot API escuchando en http://${host}:${port}`);
    if (runtime.isMock()) {
      console.log("Modo mock: agentes y git simulados.");
    }
  });

  const shutdown = async () => {
    // Cerrar los SSE antes de salir: el cliente recibe un final limpio en
    // lugar de un ERR_INCOMPLETE_CHUNKED_ENCODING al reiniciar el servidor.
    for (const stream of streams) {
      stream.end();
    }
    streams.clear();

    server.close();
    await runtime.shutdown();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return { server, runtime };
}

export type { StartOptions as ServerOptions };
