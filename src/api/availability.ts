import { execFile } from "node:child_process";
import type { AgentAvailability, AgentProvider } from "../../shared/types.js";
import { DEFAULT_LM_STUDIO_BASE_URL } from "../providers/lmstudio.js";

function cliAvailable(command: string): Promise<{ connected: boolean; reason?: string }> {
  return new Promise((resolve) => {
    execFile(
      command,
      ["--version"],
      { timeout: 5000, encoding: "utf8" },
      (error) => {
        if (!error) {
          resolve({ connected: true });
          return;
        }

        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          resolve({
            connected: false,
            reason: `CLI "${command}" no encontrado en el PATH.`,
          });
          return;
        }

        resolve({ connected: true });
      },
    );
  });
}

/** Comprueba que el servidor local de LM Studio responde en `baseUrl`. */
async function lmStudioAvailable(
  baseUrl: string,
): Promise<{ connected: boolean; reason?: string }> {
  try {
    const response = await fetch(`${baseUrl}/models`, {
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      return {
        connected: false,
        reason: `El servidor de LM Studio respondió ${response.status}.`,
      };
    }

    return { connected: true };
  } catch {
    return {
      connected: false,
      reason: `No se pudo conectar con LM Studio en ${baseUrl}.`,
    };
  }
}

export async function checkAgentAvailability(
  env: NodeJS.ProcessEnv = process.env,
): Promise<AgentAvailability[]> {
  const lmStudioBaseUrl =
    env.LMSTUDIO_BASE_URL?.trim() || DEFAULT_LM_STUDIO_BASE_URL;

  const [codex, claude, lmstudio] = await Promise.all([
    cliAvailable("codex"),
    cliAvailable("claude"),
    lmStudioAvailable(lmStudioBaseUrl),
  ]);

  const deepseekConnected = Boolean(env.DEEPSEEK_API_KEY);

  return [
    {
      provider: "codex" as AgentProvider,
      label: "Codex",
      connected: codex.connected,
      ...(codex.reason ? { reason: codex.reason } : {}),
    },
    {
      provider: "claude" as AgentProvider,
      label: "Claude",
      connected: claude.connected,
      ...(claude.reason ? { reason: claude.reason } : {}),
    },
    {
      provider: "deepseek" as AgentProvider,
      label: "DeepSeek",
      connected: deepseekConnected,
      ...(deepseekConnected
        ? {}
        : { reason: "DEEPSEEK_API_KEY no está definida." }),
    },
    {
      provider: "lmstudio" as AgentProvider,
      label: "LM Studio",
      connected: lmstudio.connected,
      ...(lmstudio.reason ? { reason: lmstudio.reason } : {}),
    },
  ];
}
