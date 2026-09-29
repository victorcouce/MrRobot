"use client";

import { useCallback, useState } from "react";
import { api } from "./api";
import { canWriteFiles } from "./agents";
import type { AgentAvailability, AgentProvider } from "./types";

/** Resultado de una comprobación que se muestra bajo su botón. */
export interface SetupResult {
  ok: boolean;
  message: string;
}

export type CliProvider = "codex" | "claude";

/** Cómo se autentica cada CLI la primera vez (lo hace el usuario en su terminal). */
export const CLI_LOGIN_COMMANDS: Record<CliProvider, string> = {
  codex: "codex login",
  claude: "claude",
};

export function isCliProvider(provider: AgentProvider): provider is CliProvider {
  return provider === "codex" || provider === "claude";
}

/** Hay al menos un agente conectado capaz de escribir archivos. */
export function hasConnectedFileWriter(agents: AgentAvailability[]): boolean {
  return agents.some(
    (agent) => agent.connected && canWriteFiles({ provider: agent.provider }),
  );
}

function persistedSuffix(result: { persisted: boolean; error?: string }): string {
  if (result.persisted) return "Guardada en .env.";
  return result.error ?? "No se pudo guardar en .env: se perderá al reiniciar el backend.";
}

export function describeDeepSeekResult(result: {
  ok: boolean;
  persisted: boolean;
  error?: string;
}): SetupResult {
  if (!result.ok) {
    return { ok: false, message: result.error ?? "La clave no es válida." };
  }
  return {
    ok: true,
    message: `Clave válida y aplicada al backend. ${persistedSuffix(result)}`,
  };
}

export function describeLmStudioResult(result: {
  ok: boolean;
  persisted: boolean;
  models?: string[];
  error?: string;
}): SetupResult {
  if (!result.ok) {
    return {
      ok: false,
      message: result.error ?? "No se pudo conectar con el servidor.",
    };
  }
  const models = result.models?.length
    ? `Modelos cargados: ${result.models.join(", ")}.`
    : "No hay ningún modelo cargado en LM Studio.";
  return {
    ok: true,
    message: `Servidor conectado. ${models} ${persistedSuffix(result)}`,
  };
}

export function describeGitHubResult(result: {
  ok: boolean;
  persisted: boolean;
  login?: string;
  error?: string;
}): SetupResult {
  if (!result.ok) {
    return { ok: false, message: result.error ?? "El token no es válido." };
  }
  const who = result.login ? ` como @${result.login}` : "";
  return {
    ok: true,
    message: `Token válido${who}. ${persistedSuffix(result)}`,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Acciones para dejar listos los proveedores (instalar CLIs, validar claves)
 * con su estado de carga y el último resultado de cada una. Tras cada acción
 * correcta llama a `refresh` para releer la disponibilidad del backend.
 */
export function useAgentSetup(refresh: () => Promise<void>) {
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, SetupResult>>({});

  const run = useCallback(
    async (key: string, action: () => Promise<SetupResult>) => {
      setBusy(key);
      setResults((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      try {
        const result = await action();
        setResults((prev) => ({ ...prev, [key]: result }));
        if (result.ok) await refresh();
        return result;
      } catch (error) {
        const result = { ok: false, message: errorMessage(error) };
        setResults((prev) => ({ ...prev, [key]: result }));
        return result;
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  const installCli = useCallback(
    (provider: CliProvider) =>
      run(provider, async () => {
        const result = await api.installCli(provider);
        return result.ok
          ? {
              ok: true,
              message: `CLI instalada. Ahora inicia sesión con \`${CLI_LOGIN_COMMANDS[provider]}\`.`,
            }
          : { ok: false, message: result.error || "No se pudo instalar la CLI." };
      }),
    [run],
  );

  const checkDeepSeek = useCallback(
    (apiKey: string) =>
      run("deepseek", async () =>
        describeDeepSeekResult(await api.checkDeepSeekKey(apiKey)),
      ),
    [run],
  );

  const checkLmStudio = useCallback(
    (baseUrl: string) =>
      run("lmstudio", async () =>
        describeLmStudioResult(await api.checkLmStudioConfig(baseUrl)),
      ),
    [run],
  );

  const checkGitHub = useCallback(
    (token: string) =>
      run("github", async () =>
        describeGitHubResult(await api.checkGitHubToken(token)),
      ),
    [run],
  );

  return { busy, results, installCli, checkDeepSeek, checkLmStudio, checkGitHub };
}
