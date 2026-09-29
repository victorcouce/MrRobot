import { spawn } from "node:child_process";

export type InstallableCliProvider = "codex" | "claude";

const CLI_PACKAGES: Record<InstallableCliProvider, string> = {
  codex: "@openai/codex",
  claude: "@anthropic-ai/claude-code",
};

export interface InstallCliResult {
  ok: boolean;
  output: string;
  error?: string;
}

export function isInstallableCliProvider(
  value: unknown,
): value is InstallableCliProvider {
  return value === "codex" || value === "claude";
}

/**
 * Instala la CLI del proveedor vía `npm install -g` en el equipo donde corre
 * el backend. No comprueba disponibilidad después: quien llama debe volver a
 * comprobarla (p. ej. con checkAgentAvailability) para refrescar el estado.
 */
export function installCli(
  provider: InstallableCliProvider,
): Promise<InstallCliResult> {
  const packageName = CLI_PACKAGES[provider];

  return new Promise((resolve) => {
    const child = spawn("npm", ["install", "-g", packageName], {
      shell: process.platform === "win32",
    });

    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });

    child.on("error", (error) => {
      resolve({ ok: false, output, error: error.message });
    });

    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        output,
        ...(code === 0
          ? {}
          : { error: `npm install salió con código ${code}.` }),
      });
    });
  });
}
