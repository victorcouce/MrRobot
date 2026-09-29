import OpenAI from "openai";
import { applyAndPersistEnvVar } from "../config/persist.js";
import { DEFAULT_LM_STUDIO_BASE_URL } from "../providers/lmstudio.js";

export interface LmStudioConfigCheck {
  ok: boolean;
  /** La URL queda aplicada al proceso del backend. */
  applied: boolean;
  /** La URL quedó guardada en .env y sobrevive a un reinicio. */
  persisted: boolean;
  baseUrl: string;
  /** Modelos que el servidor local tiene cargados en este momento. */
  models?: string[];
  error?: string;
}

/**
 * Comprueba que el servidor local de LM Studio responde en `baseUrl` y, si
 * responde, la aplica al proceso del backend para que los agentes puedan
 * usarla de inmediato y la guarda en .env para que sobreviva a un reinicio.
 */
export async function checkAndApplyLmStudioConfig(
  baseUrl: string,
): Promise<LmStudioConfigCheck> {
  const trimmed = baseUrl.trim() || DEFAULT_LM_STUDIO_BASE_URL;

  try {
    const client = new OpenAI({ apiKey: "lm-studio", baseURL: trimmed });
    const models = await client.models.list();
    const saved = await applyAndPersistEnvVar("LMSTUDIO_BASE_URL", trimmed);

    return {
      ok: true,
      applied: true,
      ...saved,
      baseUrl: trimmed,
      models: models.data.map((model) => model.id),
    };
  } catch (error) {
    return {
      ok: false,
      applied: false,
      persisted: false,
      baseUrl: trimmed,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo conectar con el servidor local de LM Studio.",
    };
  }
}
