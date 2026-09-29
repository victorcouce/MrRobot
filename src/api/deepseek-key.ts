import OpenAI from "openai";
import { applyAndPersistEnvVar } from "../config/persist.js";

const BASE_URL = "https://api.deepseek.com";

export interface DeepSeekKeyCheck {
  ok: boolean;
  /** La clave queda aplicada al proceso del backend. */
  applied: boolean;
  /** La clave quedó guardada en .env y sobrevive a un reinicio. */
  persisted: boolean;
  error?: string;
}

/**
 * Comprueba la clave contra DeepSeek y, si responde, la aplica al proceso del
 * backend para que los agentes puedan usarla de inmediato y la guarda en .env
 * para que sobreviva a un reinicio.
 */
export async function checkAndApplyDeepSeekKey(
  apiKey: string,
): Promise<DeepSeekKeyCheck> {
  const trimmed = apiKey.trim();

  if (!trimmed) {
    return {
      ok: false,
      applied: false,
      persisted: false,
      error: "La clave está vacía.",
    };
  }

  try {
    const client = new OpenAI({ apiKey: trimmed, baseURL: BASE_URL });
    await client.models.list();
  } catch (error) {
    return {
      ok: false,
      applied: false,
      persisted: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo validar la clave con DeepSeek.",
    };
  }

  const saved = await applyAndPersistEnvVar("DEEPSEEK_API_KEY", trimmed);

  return { ok: true, applied: true, ...saved };
}
