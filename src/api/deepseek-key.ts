import OpenAI from "openai";

const BASE_URL = "https://api.deepseek.com";

export interface DeepSeekKeyCheck {
  ok: boolean;
  /** La clave queda aplicada al proceso del backend. */
  applied: boolean;
  /**
   * El proceso no la recuerda tras reiniciarse: hay que dejarla en .env para
   * que sobreviva.
   */
  persisted: false;
  error?: string;
}

/**
 * Comprueba la clave contra DeepSeek y, si responde, la aplica al proceso del
 * backend para que los agentes puedan usarla de inmediato. No se escribe en
 * disco: guardar un secreto en .env es decisión de quien administra el equipo.
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

  process.env.DEEPSEEK_API_KEY = trimmed;

  return { ok: true, applied: true, persisted: false };
}
