import { execFile } from "node:child_process";
import type { AgentAvailability, AgentProvider } from "../../shared/types.js";

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

export async function checkAgentAvailability(
  env: NodeJS.ProcessEnv = process.env,
): Promise<AgentAvailability[]> {
  const [codex, claude] = await Promise.all([
    cliAvailable("codex"),
    cliAvailable("claude"),
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
  ];
}
