import { spawn } from "node:child_process";
import type { RunOptions } from "./types.js";

const MAX_BUFFER = 10 * 1024 * 1024;

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

    const append = (current: string, text: string): string => {
      const next = current + text;
      return next.length > MAX_BUFFER
        ? next.slice(next.length - MAX_BUFFER)
        : next;
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdout = append(stdout, text);
      options.onOutput?.(text);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr = append(stderr, text);
      options.onOutput?.(text);
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;

      if (options.signal?.aborted) {
        reject(new Error(`[${provider}] ejecución cancelada.`));
        return;
      }

      reject(new Error(`[${provider}] falló la ejecución: ${error.message}`));
    });

    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;

      if (options.signal?.aborted) {
        reject(new Error(`[${provider}] ejecución cancelada.`));
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
