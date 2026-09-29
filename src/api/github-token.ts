import type { GitHubTokenCheck } from "../../shared/types.js";
import { applyAndPersistEnvVar } from "../config/persist.js";

/**
 * Comprueba el token contra la API de GitHub y, si es válido, lo aplica al
 * backend y lo guarda en `.env` como GITHUB_TOKEN.
 */
export async function checkAndApplyGitHubToken(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GitHubTokenCheck> {
  const trimmed = token.trim();

  if (!trimmed) {
    return { ok: false, persisted: false, error: "El token está vacío." };
  }

  let login: string | undefined;
  try {
    const response = await fetchImpl("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${trimmed}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "mrrobot",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return {
        ok: false,
        persisted: false,
        error:
          response.status === 401
            ? "GitHub rechazó el token (401)."
            : `GitHub respondió ${response.status}.`,
      };
    }

    const body = (await response.json()) as { login?: unknown };
    if (typeof body.login === "string") login = body.login;
  } catch (error) {
    return {
      ok: false,
      persisted: false,
      error:
        error instanceof Error
          ? `No se pudo contactar con GitHub: ${error.message}`
          : "No se pudo contactar con GitHub.",
    };
  }

  const saved = await applyAndPersistEnvVar("GITHUB_TOKEN", trimmed);
  return { ok: true, ...saved, ...(login ? { login } : {}) };
}
