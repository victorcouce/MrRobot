import type { ClaudeModel } from "../agents/types.js";
import { createStreamJsonRelay, extractStreamJsonResult } from "./claude-stream.js";
import { execCli } from "./exec.js";
import type { RunOptions } from "./types.js";

export async function runClaude(
  prompt: string,
  model?: ClaudeModel,
  options: RunOptions = {},
): Promise<string> {
  const args = ["-p", prompt];

  if (model) {
    args.push("--model", model);
  }

  // Sin nadie escuchando la salida en vivo (planner/reviewer/supervisor: una
  // sola respuesta JSON) no hace falta el stream estructurado.
  if (!options.onOutput) {
    return execCli("claude", "claude", args, options);
  }

  // Con alguien escuchando (el worker de una tarea), se pide el stream
  // estructurado para narrar qué hace el agente —qué herramienta usa y sobre
  // qué fichero— en vez de mostrar solo la respuesta final cuando termina.
  args.push("--output-format", "stream-json", "--verbose");

  const raw = await execCli("claude", "claude", args, {
    ...options,
    onOutput: createStreamJsonRelay(options.onOutput),
  });

  return extractStreamJsonResult(raw) ?? raw;
}
