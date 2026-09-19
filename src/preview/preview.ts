import { spawn, type ChildProcess } from "node:child_process";
import { createReadStream } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { createServer, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import type { ProjectPreview, PreviewStatus } from "../../shared/types.js";
import type { Project } from "../projects/types.js";
import type { TaskWorkspace, WorkspaceManager } from "../workspace/types.js";

const ANSI_RE = /\u001b\[[0-9;]*m/g;
const URL_RE =
  /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0):(\d+)/i;
const MAX_LOG_LINES = 200;

export type PackageManager = "pnpm" | "yarn" | "npm";

export interface PackageJsonLike {
  scripts?: Record<string, string>;
  packageManager?: string;
}

const LOCKFILES: Array<[string, PackageManager]> = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["package-lock.json", "npm"],
];

export const PREVIEW_SCRIPTS = ["dev", "start", "preview", "serve"];

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function detectPackageManager(
  dir: string,
  pkg: PackageJsonLike,
): Promise<PackageManager> {
  const declared = pkg.packageManager ?? "";

  if (declared.startsWith("pnpm")) return "pnpm";
  if (declared.startsWith("yarn")) return "yarn";
  if (declared.startsWith("npm")) return "npm";

  for (const [file, manager] of LOCKFILES) {
    if (await exists(join(dir, file))) {
      return manager;
    }
  }

  return "npm";
}

export function pickPreviewScript(pkg: PackageJsonLike): string | undefined {
  const scripts = pkg.scripts ?? {};

  return PREVIEW_SCRIPTS.find((name) => Boolean(scripts[name]));
}

export function parsePreviewUrl(text: string): string | undefined {
  const clean = text.replace(ANSI_RE, "");
  const match = clean.match(URL_RE);

  if (!match || !match[0]) {
    return undefined;
  }

  return match[0].replace(/\/+$/, "");
}

export function installCommand(manager: PackageManager): string {
  if (manager === "yarn") return "yarn install";
  if (manager === "pnpm") return "pnpm install";
  return "npm install";
}

export function runCommand(
  manager: PackageManager,
  script: string,
): string {
  if (manager === "yarn") return `yarn ${script}`;
  if (manager === "pnpm") return `pnpm run ${script}`;
  return `npm run ${script}`;
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

export function contentTypeFor(path: string): string {
  return CONTENT_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}

interface PreviewSession {
  projectId: string;
  status: PreviewStatus;
  log: string[];
  startedAt: Date;
  url?: string;
  port?: number;
  command?: string;
  error?: string;
  child?: ChildProcess;
  installChild?: ChildProcess;
  server?: Server;
  workspace?: TaskWorkspace;
  manager?: WorkspaceManager;
}

function killProcessTree(child: ChildProcess | undefined): void {
  if (!child?.pid) return;

  try {
    if (process.platform === "win32") {
      child.kill();
    } else {
      process.kill(-child.pid, "SIGTERM");
    }
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      // El proceso ya terminó.
    }
  }
}

export class PreviewManager {
  private readonly sessions = new Map<string, PreviewSession>();

  get(projectId: string): ProjectPreview | undefined {
    const session = this.sessions.get(projectId);
    return session ? this.serialize(session) : undefined;
  }

  async start(
    project: Project,
    workspace: WorkspaceManager,
  ): Promise<ProjectPreview> {
    if (project.status !== "completed" || !project.resultCommit) {
      throw new Error(
        "Solo se puede previsualizar un proyecto completado con un commit final.",
      );
    }

    const existing = this.sessions.get(project.id);

    if (
      existing &&
      (existing.status === "starting" ||
        existing.status === "installing" ||
        existing.status === "running")
    ) {
      return this.serialize(existing);
    }

    if (existing) {
      await this.stop(project.id);
    }

    const session: PreviewSession = {
      projectId: project.id,
      status: "starting",
      log: [],
      startedAt: new Date(),
    };

    this.sessions.set(project.id, session);

    void this.launch(project, workspace, session).catch(
      async (error: unknown) => {
        session.status = "failed";
        session.error = error instanceof Error ? error.message : String(error);
        this.appendLog(session, `\n${session.error}\n`);
        await this.cleanupWorkspace(session);
      },
    );

    return this.serialize(session);
  }

  async stop(projectId: string): Promise<ProjectPreview | undefined> {
    const session = this.sessions.get(projectId);

    if (!session) {
      return undefined;
    }

    session.status = "stopped";
    killProcessTree(session.child);
    killProcessTree(session.installChild);
    this.closeServer(session);
    await this.cleanupWorkspace(session);

    return this.serialize(session);
  }

  async stopAll(): Promise<void> {
    for (const projectId of [...this.sessions.keys()]) {
      await this.stop(projectId);
    }
  }

  private async cleanupWorkspace(session: PreviewSession): Promise<void> {
    if (!session.workspace || !session.manager) return;

    const workspace = session.workspace;
    delete session.workspace;

    try {
      await session.manager.remove(workspace, { deleteBranch: true });
    } catch {
      // Limpieza best-effort.
    }
  }

  private async launch(
    project: Project,
    workspace: WorkspaceManager,
    session: PreviewSession,
  ): Promise<void> {
    const resultCommit = project.resultCommit as string;
    const ws = await workspace.create(`preview-${project.id}`, 1, resultCommit);
    session.workspace = ws;
    session.manager = workspace;

    const pkg = await this.readPackageJson(ws.path);
    const script = pkg ? pickPreviewScript(pkg) : undefined;

    if (!script) {
      if (await exists(join(ws.path, "index.html"))) {
        await this.serveStatic(session, ws.path);
        return;
      }

      throw new Error(
        pkg
          ? "No se encontró un script de arranque (dev/start/preview/serve) en package.json ni un index.html."
          : "El proyecto no tiene package.json ni un index.html: no se puede levantar un preview web.",
      );
    }

    const manager = await detectPackageManager(ws.path, pkg as PackageJsonLike);

    if (!(await exists(join(ws.path, "node_modules")))) {
      session.status = "installing";
      await this.runToCompletion(session, installCommand(manager), ws.path);
    }

    session.status = "starting";
    session.command = runCommand(manager, script);
    this.spawnServer(session, session.command, ws.path);
  }

  private async readPackageJson(
    dir: string,
  ): Promise<PackageJsonLike | undefined> {
    try {
      return JSON.parse(
        await readFile(join(dir, "package.json"), "utf8"),
      ) as PackageJsonLike;
    } catch {
      return undefined;
    }
  }

  private serveStatic(session: PreviewSession, root: string): Promise<void> {
    const base = resolve(root);

    const server = createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
      const target = resolve(base, `.${normalize(urlPath)}`);

      if (target !== base && !target.startsWith(base + sep)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      void this.serveFile(target, res);
    });

    session.server = server;
    session.command = "static server";

    return new Promise((resolve, reject) => {
      server.on("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();

        if (address && typeof address === "object") {
          session.port = address.port;
          session.url = `http://localhost:${address.port}`;
        }

        session.status = "running";
        this.appendLog(
          session,
          `Sirviendo sitio estático en ${session.url ?? "?"}\n`,
        );
        resolve();
      });
    });
  }

  private async serveFile(
    target: string,
    res: ServerResponse,
  ): Promise<void> {
    let filePath = target;

    try {
      const info = await stat(filePath);

      if (info.isDirectory()) {
        filePath = join(filePath, "index.html");
        await stat(filePath);
      }
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 Not Found");
      return;
    }

    res.writeHead(200, { "Content-Type": contentTypeFor(filePath) });
    createReadStream(filePath)
      .on("error", () => {
        res.end();
      })
      .pipe(res);
  }

  private closeServer(session: PreviewSession): void {
    if (!session.server) return;

    try {
      session.server.close();
    } catch {
      // El servidor ya estaba cerrado.
    }

    delete session.server;
  }

  private runToCompletion(
    session: PreviewSession,
    command: string,
    cwd: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, {
        cwd,
        shell: true,
        env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      });

      session.installChild = child;

      const onData = (chunk: Buffer): void => {
        this.appendLog(session, chunk.toString("utf8"));
      };

      child.stdout?.on("data", onData);
      child.stderr?.on("data", onData);
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`"${command}" falló con código ${code ?? "null"}.`));
        }
      });
    });
  }

  private spawnServer(
    session: PreviewSession,
    command: string,
    cwd: string,
  ): void {
    const child = spawn(command, {
      cwd,
      shell: true,
      detached: process.platform !== "win32",
      env: {
        ...process.env,
        BROWSER: "none",
        FORCE_COLOR: "0",
        NO_COLOR: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    session.child = child;

    const onData = (chunk: Buffer): void => {
      const text = chunk.toString("utf8");
      this.appendLog(session, text);

      if (session.url) return;

      const url = parsePreviewUrl(text);

      if (url) {
        session.url = url;
        const port = url.match(/:(\d+)/)?.[1];

        if (port) {
          session.port = Number(port);
        }

        session.status = "running";
      }
    };

    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);

    child.on("error", (error) => {
      session.status = "failed";
      session.error = error.message;
    });

    child.on("exit", (code, signal) => {
      if (session.status === "stopped") return;

      session.status = "failed";
      session.error = `El servidor de preview terminó (code=${code ?? "null"}, signal=${signal ?? "null"}).`;
      void this.cleanupWorkspace(session);
    });
  }

  private appendLog(session: PreviewSession, text: string): void {
    session.log.push(text);

    if (session.log.length > MAX_LOG_LINES) {
      session.log.splice(0, session.log.length - MAX_LOG_LINES);
    }
  }

  private serialize(session: PreviewSession): ProjectPreview {
    const preview: ProjectPreview = {
      projectId: session.projectId,
      status: session.status,
      log: session.log.join(""),
      startedAt: session.startedAt.toISOString(),
    };

    if (session.url) preview.url = session.url;
    if (session.port !== undefined) preview.port = session.port;
    if (session.command) preview.command = session.command;
    if (session.error) preview.error = session.error;

    return preview;
  }
}
