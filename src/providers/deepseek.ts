import OpenAI from "openai";
import type { RunOptions } from "./types.js";
import type { OnAgentEvent } from "../agents/types.js";
import { OpenAIChatClient } from "./agentic.js";
import { harnessLoop } from "../harness/index.js";
import { LocalSandbox, DEFAULT_SANDBOX_POLICY } from "../sandbox/index.js";
import { ensureDependencies } from "../checks/checks.js";

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

export async function runDeepSeekAgentic(
  options: RunOptions & { cwd: string; prompt: string },
  onEvent?: OnAgentEvent,
): Promise<{ text: string; commitCreated?: boolean }> {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new Error(
      "[deepseek] falta DEEPSEEK_API_KEY (defínela en el archivo .env).",
    );
  }

  const model =
    (options.agent?.provider === "deepseek" && (options.agent as { model?: string })?.model === "deepseek-v4-pro")
      ? "deepseek-v4-pro"
      : "deepseek-flash";

  const client = getClient(apiKey);
  const chatClient = new OpenAIChatClient(client, `deepseek / ${model}`);

  const sandbox = new LocalSandbox(options.cwd, DEFAULT_SANDBOX_POLICY);

  try {
    // Pre-calentar node_modules para que npm run/git/node estén disponibles
    options.onOutput?.("▸ pre-calentando dependencias...");
    await ensureDependencies(options.cwd);

    const result = await harnessLoop({
      client: chatClient,
      sandbox,
      prompt: options.prompt,
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.onOutput ? { onOutput: options.onOutput } : {}),
      ...(options.harness?.bounds ? { bounds: options.harness.bounds } : {}),
    });

    return {
      text: result.finalOutput || "Completado.",
      commitCreated: result.complete,
    };
  } finally {
    await sandbox.dispose();
  }
}
