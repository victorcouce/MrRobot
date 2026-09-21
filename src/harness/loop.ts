/**
 * Bucle de tool-calling: orquesta el modelo y las herramientas
 * hasta que termina o agota el presupuesto.
 */

import type {
  ChatClient,
  HarnessMessage,
  HarnessBounds,
  HarnessIterationResult,
} from "./types.js";
import {
  HarnessBudgetError,
  HarnessProtocolError,
  HarnessUnsupportedError,
  HarnessCancelledError,
} from "./types.js";
import { TOOL_DEFINITIONS } from "./tools.js";
import type { Sandbox } from "../sandbox/types.js";
import { SandboxViolationError } from "../sandbox/types.js";
import * as toolHandlers from "./tool-handlers.js";

const DEFAULT_BOUNDS: HarnessBounds = {
  maxIterations: 24,
  maxToolCalls: 60,
  timeoutMs: 300_000, // 5 min
  maxToolOutputChars: 4_000,
  maxHistoryChars: 60_000,
  maxInvalidToolCalls: 3,
  maxNoToolReplies: 2,
  maxSandboxViolations: 5,
};

export interface HarnessLoopOptions {
  client: ChatClient;
  sandbox: Sandbox;
  /** Tarea a implementar (se inyecta en el primer mensaje de usuario). */
  prompt: string;
  bounds?: Partial<HarnessBounds>;
  signal?: AbortSignal;
  onOutput?: (line: string) => void;
}

/**
 * Índice donde empieza la ventana reciente de `count` mensajes, ajustado para
 * no partir el emparejamiento `assistant(tool_calls)`/`tool`: si la ventana
 * empezara en un mensaje `tool`, quedaría huérfano y la API responde 400
 * ("Messages with role 'tool' must be a response to a preceding message with
 * 'tool_calls'").
 */
function recentTurnStart(history: HarnessMessage[], count: number): number {
  let start = Math.max(0, history.length - count);

  while (start < history.length && history[start]?.role === "tool") {
    start++;
  }

  if (start >= history.length) {
    // Todos los mensajes recientes eran `tool`: reanclar en el último
    // assistant, que arrastra sus respuestas `tool`.
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i]?.role === "assistant") {
        return i;
      }
    }
  }

  return start;
}

/**
 * Simplifica el historial reemplazando los pares assistant/tool más antiguos
 * por un resumen, conservando el system, el user inicial y los últimos turnos.
 */
export function pruneHistory(
  history: HarnessMessage[],
  maxChars: number,
): HarnessMessage[] {
  let totalChars = history.reduce((sum, msg) => {
    const text = "content" in msg ? msg.content : JSON.stringify(msg);
    return sum + (typeof text === "string" ? text.length : 0);
  }, 0);

  if (totalChars <= maxChars) {
    return history;
  }

  // Conservar: system, primer user, últimos turnos
  const system = history.find((m) => m.role === "system");
  const firstUser = history.find((m) => m.role === "user");
  const start = recentTurnStart(history, 4);

  const pruned: HarnessMessage[] = [];
  if (system) pruned.push(system);
  if (firstUser) pruned.push(firstUser);

  const hadOlderTurns = history
    .slice(0, start)
    .some((msg) => msg.role === "assistant" || msg.role === "tool");

  if (hadOlderTurns) {
    pruned.push({
      role: "user",
      content:
        "[Resumen: modelo intentó operaciones anteriores, continúa desde aquí]",
    });
  }

  // El primer user ya se conservó arriba; no duplicarlo.
  pruned.push(...history.slice(start).filter((msg) => msg !== firstUser));

  return pruned;
}

export async function harnessLoop(
  options: HarnessLoopOptions,
): Promise<HarnessIterationResult> {
  const bounds = { ...DEFAULT_BOUNDS, ...options.bounds };
  let iterations = 0;
  let toolCallsTotal = 0;
  let invalidToolCalls = 0;
  let noToolReplies = 0;
  let sandboxViolations = 0;

  const history: HarnessMessage[] = [
    {
      role: "system",
      content:
        "Eres un asistente que implementa tareas de desarrollo. " +
        "Usa las herramientas disponibles para leer, escribir y probar código. " +
        "Trabajas en un worktree aislado: usa SIEMPRE rutas relativas a la raíz " +
        "del proyecto (`.`) y nunca rutas absolutas ni salgas de ese directorio. " +
        "Cuando termines, llama a finish() con un resumen.",
    },
    {
      role: "user",
      content:
        "Implementa esta tarea:\n\n" +
        options.prompt +
        "\n\nCuando termines, llama a finish() para confirmar.",
    },
  ];

  const startTime = Date.now();

  while (iterations < bounds.maxIterations) {
    if (options.signal?.aborted) {
      throw new HarnessCancelledError();
    }

    if (Date.now() - startTime > bounds.timeoutMs) {
      throw new HarnessBudgetError(`superó el plazo de ${bounds.timeoutMs}ms`);
    }

    iterations++;
    options.onOutput?.(`▸ iteración ${iterations}/${bounds.maxIterations}`);

    // Podar historial si es necesario
    const prunedHistory = pruneHistory(history, bounds.maxHistoryChars);

    try {
      const reply = await options.client.complete({
        messages: prunedHistory,
        tools: TOOL_DEFINITIONS,
      });

      if (reply.toolCallingUnsupported) {
        throw new HarnessUnsupportedError(
          `${options.client.label} no soporta tool-calling`,
        );
      }

      if (!reply.toolCalls || reply.toolCalls.length === 0) {
        noToolReplies++;

        if (noToolReplies === 1) {
          // Primer empujón
          options.onOutput?.(
            "▸ empujón: no llamaste a herramientas, inténtalo de nuevo",
          );
          history.push({
            role: "assistant",
            content:
              reply.content ||
              "No llamé a ninguna herramienta en el último turno.",
          });
          history.push({
            role: "user",
            content:
              "Debes llamar a una herramienta (read_file, write_file, finish, etc) " +
              "o la tarea no avanzará.",
          });
          continue;
        } else if (noToolReplies >= bounds.maxNoToolReplies) {
          // Salida limpia
          return {
            complete: false,
            ...(reply.content ? { finalOutput: reply.content } : {}),
            toolCalls: toolCallsTotal,
            iterations,
          };
        }
      }

      history.push({
        role: "assistant",
        ...(reply.content ? { content: reply.content } : {}),
        ...(reply.toolCalls ? { toolCalls: reply.toolCalls } : {}),
      });

      if (!reply.toolCalls) {
        continue;
      }

      for (const toolCall of reply.toolCalls) {
        toolCallsTotal++;

        if (toolCallsTotal > bounds.maxToolCalls) {
          throw new HarnessBudgetError(
            `superó máximo de llamadas de herramientas (${bounds.maxToolCalls})`,
          );
        }

        let result: { ok: boolean; [key: string]: unknown };

        try {
          let args: Record<string, unknown>;
          try {
            args = JSON.parse(toolCall.argumentsRaw);
          } catch {
            invalidToolCalls++;
            if (invalidToolCalls > bounds.maxInvalidToolCalls) {
              throw new HarnessProtocolError(
                `JSON malformado en argumentos de herramienta`,
              );
            }
            const toolResult = {
              ok: false,
              error: `JSON malformado: ${toolCall.argumentsRaw.slice(0, 100)}`,
            };
            options.onOutput?.(
              `✗ ${toolCall.name}\n  ← JSON malformado`,
            );
            history.push({
              role: "tool",
              toolCallId: toolCall.id,
              name: toolCall.name,
              content: JSON.stringify(toolResult),
            });
            continue;
          }

          // Despachar herramienta
          const handler = (toolHandlers as Record<string, unknown>)[
            `handle_${toolCall.name}`
          ] as ((sandbox: Sandbox, args: unknown) => Promise<unknown>) | undefined;

          if (!handler) {
            result = {
              ok: false,
              error: `herramienta desconocida: ${toolCall.name}`,
            };
          } else {
            try {
              const output = await handler(options.sandbox, args);

              if (toolCall.name === "finish") {
                return {
                  complete: true,
                  toolCalls: toolCallsTotal,
                  iterations,
                };
              }

              result = {
                ok: true,
                ...(typeof output === "object" && output !== null ? output : {}),
              };
            } catch (err) {
              if (err instanceof SandboxViolationError) {
                sandboxViolations++;
                if (sandboxViolations > bounds.maxSandboxViolations) {
                  throw err;
                }
              }

              const message =
                err instanceof Error ? err.message : String(err);
              result = { ok: false, error: message };
            }
          }

          // Limitar la salida
          let toolOutput = JSON.stringify(result);
          if (toolOutput.length > bounds.maxToolOutputChars) {
            toolOutput = toolOutput.slice(0, bounds.maxToolOutputChars) + "…";
          }

          options.onOutput?.(
            `▸ ${toolCall.name}\n  ← ${result.ok ? "✓" : "✗"} ${
              result.error || result.message || "ok"
            }`,
          );

          history.push({
            role: "tool",
            toolCallId: toolCall.id,
            name: toolCall.name,
            content: toolOutput,
          });
        } catch (err) {
          throw err;
        }
      }
    } catch (err) {
      // Errores de transporte se propagan sin envolver (429, timeouts, etc)
      if (err instanceof Error && !err.message.includes("[")) {
        throw err;
      }
      throw err;
    }
  }

  throw new HarnessBudgetError(`agotadas ${bounds.maxIterations} iteraciones`);
}
