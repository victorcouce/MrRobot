import OpenAI from "openai";
import type { RunOptions } from "./types.js";
import type { OnAgentEvent } from "../agents/types.js";
import { OpenAIChatClient } from "./agentic.js";
import { harnessLoop } from "../harness/index.js";
import { LocalSandbox, DEFAULT_SANDBOX_POLICY } from "../sandbox/index.js";
import { ensureDependencies } from "../checks/checks.js";
import { recordUsage, usageFromOpenAI } from "../agents/usage.js";

/** Modelo cargado en LM Studio: identificador dinámico, sin enum fijo. */
export type LmStudioModel = string;

export const DEFAULT_LM_STUDIO_BASE_URL = "http://localhost:1234/v1";

function getBaseUrl(): string {
  return process.env.LMSTUDIO_BASE_URL?.trim() || DEFAULT_LM_STUDIO_BASE_URL;
}

let cachedClient: OpenAI | undefined;
let cachedBaseUrl: string | undefined;

/** Reutiliza el cliente salvo que cambie la URL base (se puede aplicar en caliente). */
function getClient(baseUrl: string): OpenAI {
  if (!cachedClient || cachedBaseUrl !== baseUrl) {
    // LM Studio no valida la API key, pero el SDK de OpenAI exige un string no vacío.
    cachedClient = new OpenAI({ apiKey: "lm-studio", baseURL: baseUrl });
    cachedBaseUrl = baseUrl;
  }

  return cachedClient;
}

async function resolveModel(client: OpenAI, requested?: LmStudioModel): Promise<string> {
  if (requested) return requested;

  const models = await client.models.list();
  const first = models.data[0]?.id;

  if (!first) {
    throw new Error(
      "[lmstudio] no hay ningún modelo cargado en el servidor local (carga uno en LM Studio).",
    );
  }

  return first;
}

export async function runLmStudio(
  prompt: string,
  model?: LmStudioModel,
): Promise<string> {
  const baseUrl = getBaseUrl();
  const client = getClient(baseUrl);

  try {
    const resolvedModel = await resolveModel(client, model);

    const response = await client.chat.completions.create({
      model: resolvedModel,
      messages: [{ role: "user", content: prompt }],
    });

    const usage = usageFromOpenAI(response.usage);
    if (usage) recordUsage(usage);

    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error("respuesta vacía del modelo");
    }

    return content.trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    throw new Error(`[lmstudio] falló la ejecución: ${message}`);
  }
}

export async function runLmStudioAgentic(
  options: RunOptions & { cwd: string; prompt: string },
  onEvent?: OnAgentEvent,
): Promise<{ text: string; commitCreated?: boolean }> {
  const baseUrl = getBaseUrl();
  const client = getClient(baseUrl);

  const requestedModel =
    options.agent?.provider === "lmstudio" ? options.agent.model : undefined;
  const model = await resolveModel(client, requestedModel).catch((error) => {
    throw new Error(
      error instanceof Error ? `[lmstudio] ${error.message}` : String(error),
    );
  });

  const chatClient = new OpenAIChatClient(client, `lmstudio / ${model}`, model);

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
