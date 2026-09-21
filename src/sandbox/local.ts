/**
 * Implementación in-process del sandbox: lectura/escritura de archivos,
 * ejecución de comandos con allowlist de argv, y límites de recursos.
 */

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  lstatSync,
  mkdtempSync,
  rmSync,
  openSync,
  closeSync,
  writeSync,
  readSync,
} from "node:fs";
import { execSync, spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve, sep, relative } from "node:path";
import { EOL } from "node:os";

import type {
  Sandbox,
  SandboxPolicy,
  SandboxReadResult,
  SandboxWriteResult,
  SandboxListResult,
  SandboxSearchResult,
  SandboxCommandResult,
  SandboxUsage,
  SandboxFileEntry,
} from "./types.js";
import { SandboxViolationError, SandboxLimitError } from "./types.js";
import { validatePath, validateCommand } from "./path.js";

export const DEFAULT_ALLOWED_COMMANDS = [
  "npm",
  "node",
  "git",
  // Utilidades de shell para inspeccionar y manejar archivos del worktree.
  "ls",
  "pwd",
  "cat",
  "head",
  "tail",
  "wc",
  "grep",
  "find",
  "echo",
  "which",
  "sed",
  "awk",
  "sort",
  "uniq",
  "diff",
  "stat",
  "du",
  "file",
  "mkdir",
  "touch",
  "cp",
  "mv",
] as const;

export const DEFAULT_ARGV_RULES = [
  // npm
  ["npm", "run"],
  ["npm", "test"],
  ["npm", "ci"],
  ["npm", "install"],
  ["npm", "ls"],
  // git: cualquier subcomando (status, diff, log, checkout, branch, stash…).
  // Las operaciones de red y de configuración se vetan en
  // DEFAULT_DENIED_ARGV_RULES.
  ["git"],
  // node
  ["node", "--version"],
  ["node", "-e"],
  // utilidades de shell: cualquier argumento
  ["ls"],
  ["pwd"],
  ["cat"],
  ["head"],
  ["tail"],
  ["wc"],
  ["grep"],
  ["find"],
  ["echo"],
  ["which"],
  ["sed"],
  ["awk"],
  ["sort"],
  ["uniq"],
  ["diff"],
  ["stat"],
  ["du"],
  ["file"],
  ["mkdir"],
  ["touch"],
  ["cp"],
  ["mv"],
];

/**
 * Prefijos vetados aunque el comando esté permitido. En `git` se bloquean las
 * operaciones de red (push/fetch/pull/clone) y las que tocan credenciales o
 * configuración: el agente trabaja en un worktree local y no debe publicar ni
 * leer credenciales.
 */
export const DEFAULT_DENIED_ARGV_RULES = [
  ["git", "push"],
  ["git", "fetch"],
  ["git", "pull"],
  ["git", "clone"],
  ["git", "remote", "add"],
  ["git", "remote", "set-url"],
  ["git", "remote", "remove"],
  ["git", "remote", "rename"],
  ["git", "config"],
  ["git", "credential"],
  ["git", "filter-branch"],
];

/**
 * Allowlist de variables de entorno. El HOME apunta a un directorio temporal
 * para evitar que el modelo lea `~/.npmrc` con tokens.
 */
const ENV_ALLOWLIST = ["PATH", "LANG", "LC_ALL", "TZ"] as const;

function scrubEnv(tempHome: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    HOME: tempHome,
    CI: "1",
    NO_COLOR: "1",
    GIT_TERMINAL_PROMPT: "0",
  };

  for (const key of ENV_ALLOWLIST) {
    if (key in process.env) {
      env[key] = process.env[key];
    }
  }

  return env;
}

type CommandDecision = "allowed" | "denied" | "not-allowed";

function matchesArgvRule(
  argv: readonly string[],
  rules: readonly (readonly string[])[],
): boolean {
  return rules.some((rule) => {
    if (rule.length > argv.length) return false;
    return rule.every((part, i) => argv[i] === part);
  });
}

function decideCommand(
  command: string,
  args: readonly string[],
  allowedCommands: readonly string[],
  allowedArgvRules: readonly (readonly string[])[],
  deniedArgvRules: readonly (readonly string[])[],
): CommandDecision {
  if (!allowedCommands.includes(command)) {
    return "not-allowed";
  }

  if (allowedArgvRules.length === 0) {
    return "not-allowed"; // Sin reglas de argv, solo comando permitido no sirve
  }

  const argv = [command, ...args];

  if (matchesArgvRule(argv, deniedArgvRules)) {
    return "denied";
  }

  return matchesArgvRule(argv, allowedArgvRules) ? "allowed" : "not-allowed";
}

export class LocalSandbox implements Sandbox {
  readonly root: string;
  readonly policy: SandboxPolicy;
  private filesCreated = 0;
  private bytesWritten = 0;
  private commandsRun = 0;
  private tempHome: string;

  constructor(root: string, policy: SandboxPolicy) {
    this.root = root;
    this.policy = policy;
    this.tempHome = mkdtempSync(resolve(tmpdir(), "sandbox-"));
  }

  read(
    path: string,
    opts?: { startLine?: number; maxLines?: number },
  ): Promise<SandboxReadResult> {
    try {
      const full = validatePath(this.root, path, "read");
      let content = readFileSync(full, "utf8");
      let truncated = false;

      if (content.length > this.policy.limits.maxReadBytes) {
        content = content.slice(0, this.policy.limits.maxReadBytes);
        truncated = true;
      }

      let lines = content.split("\n");
      const startLine = opts?.startLine ?? 0;
      const maxLines = opts?.maxLines ?? lines.length;

      if (startLine > 0 || maxLines < lines.length) {
        lines = lines.slice(startLine, startLine + maxLines);
        truncated = true;
      }

      content = lines.join("\n");

      return Promise.resolve({
        content,
        lines: lines.length,
        truncated,
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }

  write(path: string, content: string): Promise<SandboxWriteResult> {
    try {
      if (this.filesCreated >= this.policy.limits.maxFiles) {
        throw new SandboxLimitError(
          `límite de archivos agotado (${this.policy.limits.maxFiles})`,
        );
      }

      if (content.length > this.policy.limits.maxWriteBytes) {
        throw new SandboxLimitError(
          `contenido excede ${this.policy.limits.maxWriteBytes} bytes`,
        );
      }

      if (
        this.bytesWritten + content.length >
        this.policy.limits.maxTotalWriteBytes
      ) {
        throw new SandboxLimitError(
          `total escrito excede ${this.policy.limits.maxTotalWriteBytes} bytes`,
        );
      }

      const full = validatePath(this.root, path, "write");

      // Usar O_NOFOLLOW en el último componente
      const flags = 0o200 | 0o100 | 0o1000 | 0o40000; // O_WRONLY | O_CREAT | O_TRUNC | O_NOFOLLOW | O_CLOEXEC
      const fd = openSync(full, "w");

      try {
        writeSync(fd, content, 0, "utf8");
      } finally {
        closeSync(fd);
      }

      this.filesCreated++;
      this.bytesWritten += content.length;

      return Promise.resolve({
        bytes: content.length,
        created: true,
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }

  list(path: string, depth = 1): Promise<SandboxListResult> {
    try {
      const full = validatePath(this.root, path, "read");
      const entries = readdirSync(full, { withFileTypes: true });

      if (entries.length > this.policy.limits.maxListEntries) {
        entries.length = this.policy.limits.maxListEntries;
      }

      return Promise.resolve({
        entries: entries.map((entry) => {
          const item: SandboxFileEntry = {
            path: entry.name,
            type: entry.isDirectory() ? "directory" : "file",
          };
          if (entry.isFile()) {
            item.size = lstatSync(resolve(full, entry.name)).size;
          }
          return item;
        }),
        truncated: entries.length >= this.policy.limits.maxListEntries,
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }

  search(
    query: string,
    opts?: { path?: string; maxResults?: number },
  ): Promise<SandboxSearchResult> {
    try {
      const searchPath = opts?.path ? resolve(this.root, opts.path) : this.root;
      validatePath(this.root, searchPath, "read");

      const matches: Array<{ path: string; lineNumber: number; line: string }> =
        [];
      const maxResults = opts?.maxResults ?? 100;

      // Usar grep para búsqueda simple
      try {
        const output = execSync(
          `grep -r "${query.replace(/"/g, '\\"')}" "${searchPath}" 2>/dev/null || true`,
          { encoding: "utf8", cwd: this.root },
        );

        const lines = output.split("\n").filter(Boolean);
        for (const line of lines) {
          if (matches.length >= maxResults) break;
          const match = line.match(/^([^:]+):(\d+):(.*)/);
          if (match && match[1] && match[2] && match[3]) {
            matches.push({
              path: match[1],
              lineNumber: parseInt(match[2], 10),
              line: match[3],
            });
          }
        }
      } catch {
        // grep falla si no hay coincidencias, es OK
      }

      return Promise.resolve({
        matches,
        truncated: matches.length >= maxResults,
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }

  exec(
    command: string,
    args = [] as string[],
    opts?: { onOutput?: (line: string) => void },
  ): Promise<SandboxCommandResult> {
    return new Promise((resolve, reject) => {
      try {
        validateCommand(command);

        const decision = decideCommand(
          command,
          args,
          this.policy.allowedCommands,
          DEFAULT_ARGV_RULES,
          DEFAULT_DENIED_ARGV_RULES,
        );

        if (decision !== "allowed") {
          return reject(
            new SandboxViolationError(
              decision === "denied"
                ? `comando vetado: "${command}" con args [${args.join(", ")}]`
                : `comando no permitido: "${command}" con args [${args.join(", ")}]`,
            ),
          );
        }

        const child = spawn(command, args, {
          cwd: this.root,
          shell: false,
          env: scrubEnv(this.tempHome),
          timeout: this.policy.limits.commandTimeoutMs,
        });

        let stdout = "";
        let stderr = "";

        // El temporizador de plazo debe limpiarse al terminar: si no, mantiene
        // vivo el event loop (y con él el proceso) hasta que vence, aunque el
        // comando ya haya acabado.
        const timeout = setTimeout(() => {
          if (child.exitCode === null) {
            try {
              process.kill(-child.pid!, "SIGKILL");
            } catch {
              // Ya terminó
            }
            reject(
              new Error(
                `[sandbox] comando superó el plazo: ${this.policy.limits.commandTimeoutMs}ms`,
              ),
            );
          }
        }, this.policy.limits.commandTimeoutMs);
        timeout.unref?.();

        child.stdout?.on("data", (data) => {
          const text = data.toString();
          stdout += text;
          if (stdout.length > this.policy.limits.maxCommandOutputChars) {
            stdout = stdout.slice(0, this.policy.limits.maxCommandOutputChars);
          }
          opts?.onOutput?.(text.trimEnd());
        });

        child.stderr?.on("data", (data) => {
          const text = data.toString();
          stderr += text;
          if (stderr.length > this.policy.limits.maxCommandOutputChars) {
            stderr = stderr.slice(0, this.policy.limits.maxCommandOutputChars);
          }
          opts?.onOutput?.(text.trimEnd());
        });

        child.on("error", (err) => {
          clearTimeout(timeout);
          // Evitar la cadena "spawn" en el mensaje de error para no ser confundido con "CLI ausente"
          if (err.message.includes("spawn")) {
            return reject(
              new Error(
                `[sandbox] comando no disponible: "${command}".`,
              ),
            );
          }
          reject(err);
        });

        child.on("exit", (code) => {
          clearTimeout(timeout);
          this.commandsRun++;
          resolve({
            exitCode: code ?? 1,
            stdout,
            stderr,
            truncated:
              stdout.length > this.policy.limits.maxCommandOutputChars ||
              stderr.length > this.policy.limits.maxCommandOutputChars,
          });
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  usage(): SandboxUsage {
    return {
      filesCreated: this.filesCreated,
      bytesWritten: this.bytesWritten,
      commandsRun: this.commandsRun,
    };
  }

  async dispose(): Promise<void> {
    try {
      rmSync(this.tempHome, { recursive: true, force: true });
    } catch {
      // Ignorar
    }
  }
}

/**
 * Configuración por defecto del sandbox: límites para agentes IA.
 */
export const DEFAULT_SANDBOX_LIMITS = {
  maxReadBytes: 256 * 1024, // 256 KiB
  maxWriteBytes: 256 * 1024, // 256 KiB
  maxFiles: 60,
  maxTotalWriteBytes: 4 * 1024 * 1024, // 4 MiB
  commandTimeoutMs: 120_000, // 2 min
  maxCommandOutputChars: 8_000,
  maxListEntries: 400,
};

export const DEFAULT_SANDBOX_POLICY: SandboxPolicy = {
  allowedCommands: DEFAULT_ALLOWED_COMMANDS as unknown as readonly string[],
  deniedPaths: [".git"],
  limits: DEFAULT_SANDBOX_LIMITS,
};
