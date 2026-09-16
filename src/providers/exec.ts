import { execFile } from "node:child_process";
import type { RunOptions } from "./types.js";

const MAX_BUFFER = 10 * 1024 * 1024;

export function execCli(
  provider: string,
  command: string,
  args: string[],
  options: RunOptions = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      command,
      args,
      {
        cwd: options.cwd ?? process.cwd(),
        maxBuffer: MAX_BUFFER,
        encoding: "utf8",
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve(stdout.trim());
          return;
        }

        const code = error.code ?? "desconocido";
        const detail = stderr.trim() || stdout.trim() || error.message;

        reject(
          new Error(
            `[${provider}] falló la ejecución (exit code: ${code}): ${detail}`,
          ),
        );
      },
    );

    // Algunos CLIs (p.ej. codex) esperan EOF en stdin aunque reciban el prompt como argumento.
    child.stdin?.end();
  });
}
