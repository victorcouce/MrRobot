import type { ClaudeModel } from "../agents/types.js";
import { createStreamJsonRelay, extractStreamJsonResult } from "./claude-stream.js";
import { execCli } from "./exec.js";
import type { RunOptions } from "./types.js";

const PERMISSION_MODES = new Set([
  "default",
  "acceptEdits",
  "bypassPermissions",
  "plan",
]);

/**
 * Modo con el que el worker puede escribir en su worktree. Se puede subir a
 * `bypassPermissions` con MRROBOT_CLAUDE_PERMISSION_MODE si las tareas también
 * necesitan ejecutar comandos (instalar dependencias, lanzar tests).
 */
const DEFAULT_WRITE_PERMISSION_MODE = "acceptEdits";

const PERMISSION_MODE_ENV = "MRROBOT_CLAUDE_PERMISSION_MODE";

let warnedInvalidMode = false;

/**
 * Permisos del CLI de Claude según el acceso a disco que pide el rol.
 *
 * En `-p` (no interactivo) no hay nadie a quien preguntar: con el modo por
 * defecto toda edición se deniega en silencio, el agente devuelve texto sin
 * tocar el worktree y la tarea muere con "no creó ni modificó ningún archivo".
 * Por eso el worker arranca en `acceptEdits`. Los roles de solo lectura
 * (planner, reviewer, supervisor) no llevan flag: leer no pide permiso.
 */
export function claudePermissionMode(
  sandbox: RunOptions["sandbox"],
): string | undefined {
  if (sandbox === "read-only") {
    return undefined;
  }

  const override = process.env[PERMISSION_MODE_ENV]?.trim();

  if (!override) {
    return DEFAULT_WRITE_PERMISSION_MODE;
  }

  if (PERMISSION_MODES.has(override)) {
    return override;
  }

  if (!warnedInvalidMode) {
    warnedInvalidMode = true;
    console.warn(
      `${PERMISSION_MODE_ENV}="${override}" no es un modo válido ` +
        `(${[...PERMISSION_MODES].join(", ")}); se usa ${DEFAULT_WRITE_PERMISSION_MODE}.`,
    );
  }

  return DEFAULT_WRITE_PERMISSION_MODE;
}

export function claudeArgs(
  prompt: string,
  model?: ClaudeModel,
  options: RunOptions = {},
): string[] {
  const args = ["-p", prompt];
  const permissionMode = claudePermissionMode(options.sandbox);

  if (permissionMode) {
    args.push("--permission-mode", permissionMode);
  }

  if (model) {
    args.push("--model", model);
  }

  // Con alguien escuchando la salida en vivo (el worker de una tarea), se
  // pide el stream estructurado para narrar qué hace el agente —qué
  // herramienta usa y sobre qué fichero— en vez de mostrar solo la respuesta
  // final cuando termina. Sin eso (planner/reviewer/supervisor: una sola
  // respuesta JSON) no hace falta.
  if (options.onOutput) {
    args.push("--output-format", "stream-json", "--verbose");
  }

  return args;
}

export async function runClaude(
  prompt: string,
  model?: ClaudeModel,
  options: RunOptions = {},
): Promise<string> {
  const args = claudeArgs(prompt, model, options);

  if (!options.onOutput) {
    return execCli("claude", "claude", args, options);
  }

  const raw = await execCli("claude", "claude", args, {
    ...options,
    onOutput: createStreamJsonRelay(options.onOutput),
  });

  return extractStreamJsonResult(raw) ?? raw;
}
