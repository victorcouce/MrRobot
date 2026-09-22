import { spawn } from "node:child_process";
import type { RunOptions } from "./types.js";

const MAX_BUFFER = 10 * 1024 * 1024;

/**
 * Tiempo sin ninguna salida del CLI tras el que se da por colgado. El 22-09
 * Codex se quedó esperando al modelo con la conexión abierta y sin emitir
 * nada, y la tarea (y el proyecto) quedaron parados sin límite. Los roles sin
 * salida en vivo (planner, reviewer) solo escriben al final, así que el margen
 * es amplio. Configurable con MRROBOT_CLI_IDLE_TIMEOUT_MS (0 = sin límite).
 */
export const DEFAULT_IDLE_TIMEOUT_MS = 10 * 60_000;

function idleTimeoutMs(options: RunOptions): number {
  if (options.idleTimeoutMs !== undefined) return options.idleTimeoutMs;
  const fromEnv = Number(process.env.MRROBOT_CLI_IDLE_TIMEOUT_MS);
  return Number.isFinite(fromEnv) && process.env.MRROBOT_CLI_IDLE_TIMEOUT_MS
    ? fromEnv
    : DEFAULT_IDLE_TIMEOUT_MS;
}

/**
 * Ejecuta un CLI y devuelve su stdout. Emite stdout y stderr en vivo por
 * `options.onOutput` para poder mostrar el progreso del agente en la UI.
 */
export function execCli(
  provider: string,
  command: string,
  args: string[],
  options: RunOptions = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? process.cwd(),
      ...(options.signal ? { signal: options.signal } : {}),
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let idledOut = false;

    const idleMs = idleTimeoutMs(options);
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const touch = (): void => {
      if (idleMs <= 0) return;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        idledOut = true;
        child.kill("SIGTERM");
        // Si no atiende SIGTERM, se fuerza.
        setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
      }, idleMs);
    };
    touch();

    const append = (current: string, text: string): string => {
      const next = current + text;
      return next.length > MAX_BUFFER
        ? next.slice(next.length - MAX_BUFFER)
        : next;
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdout = append(stdout, text);
      touch();
      options.onOutput?.(text);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr = append(stderr, text);
      touch();
      options.onOutput?.(text);
    });

    child.on("error", (error) => {
      if (idleTimer) clearTimeout(idleTimer);
      if (settled) return;
      settled = true;

      if (options.signal?.aborted) {
        reject(new Error(`[${provider}] ejecución cancelada.`));
        return;
      }

      reject(new Error(`[${provider}] falló la ejecución: ${error.message}`));
    });

    child.on("close", (code, signal) => {
      if (idleTimer) clearTimeout(idleTimer);
      if (settled) return;
      settled = true;

      if (options.signal?.aborted) {
        reject(new Error(`[${provider}] ejecución cancelada.`));
        return;
      }

      // "timeout" hace que se clasifique como indisponibilidad (red): se pasa
      // al siguiente agente sin reintentar uno que acaba de colgarse.
      if (idledOut) {
        reject(
          new Error(
            `[${provider}] timeout: sin actividad durante ${Math.round(idleMs / 1000)}s, se aborta.`,
          ),
        );
        return;
      }

      if (code === 0) {
        resolve(stdout.trim());
        return;
      }

      const detail =
        stderr.trim() || stdout.trim() || `señal ${signal ?? "desconocida"}`;

      reject(
        new Error(
          `[${provider}] falló la ejecución (exit code: ${code ?? "desconocido"}): ${detail}`,
        ),
      );
    });

    // Algunos CLIs (p.ej. codex) esperan EOF en stdin aunque reciban el prompt como argumento.
    child.stdin?.end();
  });
}
