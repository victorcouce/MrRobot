import OpenAI from "openai";

export type DeepSeekModel = "deepseek-flash" | "deepseek-v4-pro";

const DEFAULT_MODEL: DeepSeekModel = "deepseek-flash";

const BASE_URL = "https://api.deepseek.com";

let cachedClient: OpenAI | undefined;
let cachedKey: string | undefined;

/** Reutiliza el cliente salvo que cambie la clave (se puede aplicar en caliente). */
function getClient(apiKey: string): OpenAI {
  if (!cachedClient || cachedKey !== apiKey) {
    cachedClient = new OpenAI({ apiKey, baseURL: BASE_URL });
    cachedKey = apiKey;
  }

  return cachedClient;
}

export async function runDeepSeek(
  prompt: string,
  model: DeepSeekModel = DEFAULT_MODEL,
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new Error(
      "[deepseek] falta DEEPSEEK_API_KEY (defínela en el archivo .env).",
    );
  }

  const client = getClient(apiKey);

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error("respuesta vacía del modelo");
    }

    return content.trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    throw new Error(`[deepseek] falló la ejecución: ${message}`);
  }
}
