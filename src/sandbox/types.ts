/**
 * Jaula de rutas + límites de recursos para ejecución agéntica.
 * Agnóstico de cómo se implemente (in-process, contenedor, etc).
 */

export interface SandboxLimits {
  /** Máximo de bytes a leer en una llamada a `read`. */
  maxReadBytes: number;
  /** Máximo de bytes a escribir en una llamada a `write`. */
  maxWriteBytes: number;
  /** Máximo de archivos en el worktree. */
  maxFiles: number;
  /** Máximo de bytes totales escritos acumulados. */
  maxTotalWriteBytes: number;
  /** Tiempo máximo de ejecución de un comando. */
  commandTimeoutMs: number;
  /** Máximo de caracteres en la salida de un comando. */
  maxCommandOutputChars: number;
  /** Máximo de entradas en `list`. */
  maxListEntries: number;
}

export interface SandboxPolicy {
  /** argv[0] permitidos, igualdad exacta. Vacío = ningún comando. */
  allowedCommands: readonly string[];
  /** Prefijos vetados por segmento, relativos a la raíz. Siempre incluye ".git". */
  deniedPaths: readonly string[];
  limits: SandboxLimits;
}

export interface SandboxFileEntry {
  path: string;
  type: "file" | "directory";
  size?: number;
}

export interface SandboxSearchMatch {
  path: string;
  lineNumber: number;
  line: string;
}

export interface SandboxReadResult {
  content: string;
  lines: number;
  truncated: boolean;
}

export interface SandboxWriteResult {
  bytes: number;
  created: boolean;
}

export interface SandboxListResult {
  entries: SandboxFileEntry[];
  truncated: boolean;
}

export interface SandboxSearchResult {
  matches: SandboxSearchMatch[];
  truncated: boolean;
}

export interface SandboxCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
}

export interface SandboxUsage {
  filesCreated: number;
  bytesWritten: number;
  commandsRun: number;
}

export interface Sandbox {
  readonly root: string;
  readonly policy: SandboxPolicy;

  read(
    path: string,
    opts?: { startLine?: number; maxLines?: number },
  ): Promise<SandboxReadResult>;

  write(path: string, content: string): Promise<SandboxWriteResult>;

  list(path: string, depth?: number): Promise<SandboxListResult>;

  search(
    query: string,
    opts?: { path?: string; maxResults?: number },
  ): Promise<SandboxSearchResult>;

  exec(
    command: string,
    args?: string[],
    opts?: { onOutput?: (line: string) => void },
  ): Promise<SandboxCommandResult>;

  usage(): SandboxUsage;

  dispose(): Promise<void>;
}

/**
 * Error que viola la política de sandbox: acceso a `.git`, ruta fuera de la
 * raíz, comando no permitido, etc. Prefijo "[sandbox] " en todos los mensajes.
 */
export class SandboxViolationError extends Error {
  constructor(message: string) {
    super(`[sandbox] ${message}`);
    this.name = "SandboxViolationError";
  }
}

/**
 * Error de recurso agotado: límite de archivos, bytes, comandos, etc.
 * Prefijo "[sandbox] " en todos los mensajes.
 */
export class SandboxLimitError extends Error {
  constructor(message: string) {
    super(`[sandbox] ${message}`);
    this.name = "SandboxLimitError";
  }
}
