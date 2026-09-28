import OpenAI from "openai";
import { DEFAULT_LM_STUDIO_BASE_URL } from "../providers/lmstudio.js";

export interface LmStudioConfigCheck {
  ok: boolean;
  /** La URL queda aplicada al proceso del backend. */
  applied: boolean;
  /**
   * El proceso no la recuerda tras reiniciarse: hay que dejarla en .env para
   * que sobreviva.
   */
  persisted: false;
  baseUrl: string;
  /** Modelos que el servidor local tiene cargados en este momento. */
  models?: string[];
  error?: string;
}

/**
 * Comprueba que el servidor local de LM Studio responde en `baseUrl` y, si
 * responde, la aplica al proceso del backend para que los agentes puedan
 * usarla de inmediato. No se escribe en disco: guardar la URL en .env es
 * decisión de quien administra el equipo.
 */
export async function checkAndApplyLmStudioConfig(
  baseUrl: string,
): Promise<LmStudioConfigCheck> {
  const trimmed = baseUrl.trim() || DEFAULT_LM_STUDIO_BASE_URL;

  try {
    const client = new OpenAI({ apiKey: "lm-studio", baseURL: trimmed });
    const models = await client.models.list();

    process.env.LMSTUDIO_BASE_URL = trimmed;

    return {
      ok: true,
      applied: true,
      persisted: false,
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
