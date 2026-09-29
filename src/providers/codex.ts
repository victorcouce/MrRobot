import { execCli } from "./exec.js";
import type { RunOptions } from "./types.js";

const NETWORK_ENV = "MRROBOT_CODEX_NETWORK";

/**
 * `workspace-write` bloquea la red por defecto. Sin ella, `npm install` falla
 * con ENOTFOUND o se cuelga hasta que el agente lo mata y busca un apaño
 * offline: el 23-09 eso costó ~3 min en un proyecto de 16. Se habilita salvo
 * `MRROBOT_CODEX_NETWORK=0`.
 */
export function codexArgs(prompt: string, options: RunOptions = {}): string[] {
  const sandbox = options.sandbox ?? "workspace-write";
  const args = ["exec", "--sandbox", sandbox];

  if (sandbox === "workspace-write" && process.env[NETWORK_ENV] !== "0") {
    args.push("-c", "sandbox_workspace_write.network_access=true");
  }

  return [...args, prompt];
}

export function runCodex(
  prompt: string,
  options: RunOptions = {},
): Promise<string> {
  return execCli("codex", "codex", codexArgs(prompt, options), options);
}
