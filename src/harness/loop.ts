/**
 * Bucle de tool-calling: orquesta el modelo y las herramientas
 * hasta que termina o agota el presupuesto.
 */

import type {
  ChatClient,
  ChatToolCall,
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
  maxIterations: 40,
  maxToolCalls: 100,
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

/** Caracteres de un mensaje, incluidos los argumentos de sus tool calls. */
export function messageChars(msg: HarnessMessage): number {
  let chars = typeof msg.content === "string" ? msg.content.length : 0;

  if (msg.role === "assistant" && msg.toolCalls) {
    for (const call of msg.toolCalls) {
      chars += call.name.length + call.argumentsRaw.length;
    }
  }

  return chars;
}

export function historyChars(history: HarnessMessage[]): number {
  return history.reduce((sum, msg) => sum + messageChars(msg), 0);
}

/** Mensajes finales que la compactación nunca toca: el trabajo en curso. */
const KEEP_RECENT_MESSAGES = 6;
/** Por debajo de este tamaño no compensa compactar un mensaje. */
const COMPACT_MIN_CHARS = 300;
/**
 * Al compactar se baja hasta esta fracción de `maxHistoryChars`, no justo por
 * debajo del límite: así el historial vuelve a crecer durante varias
 * iteraciones sin cambiar su prefijo y la caché de prefijo del proveedor
 * (DeepSeek) lo sigue aprovechando.
 */
const COMPACT_TARGET_RATIO = 0.5;

function describeCall(call: ChatToolCall | undefined): string {
  if (!call) return "herramienta";

  try {
    const args = JSON.parse(call.argumentsRaw) as Record<string, unknown>;

    if (typeof args.command === "string") {
      const extra = Array.isArray(args.args) ? args.args.map(String) : [];
      return `${call.name} ${[args.command, ...extra].join(" ")}`.slice(0, 160);
    }
    if (typeof args.path === "string") return `${call.name} ${args.path}`;
    if (typeof args.pattern === "string") return `${call.name} "${args.pattern}"`;
  } catch {
    // Argumentos malformados: basta con el nombre.
  }

  return call.name;
}

/**
 * Compacta los argumentos largos de un tool call ya ejecutado (el `content` de
 * un write_file, el find/replace de un edit_file) sin romper el JSON: el
 * modelo sigue viendo qué archivo tocó, pero no el contenido entero.
 */
function compactArguments(call: ChatToolCall): ChatToolCall {
  if (call.argumentsRaw.length <= COMPACT_MIN_CHARS) return call;

  let args: Record<string, unknown>;
  try {
    args = JSON.parse(call.argumentsRaw) as Record<string, unknown>;
  } catch {
    return call;
  }

  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string" && value.length > COMPACT_MIN_CHARS) {
      args[key] = `[${value.length} caracteres omitidos: ya aplicado]`;
    }
  }

  const argumentsRaw = JSON.stringify(args);
  return argumentsRaw.length < call.argumentsRaw.length
    ? { ...call, argumentsRaw }
    : call;
}

/**
 * Compacta el historial en sitio cuando supera `maxChars`: sustituye las
 * salidas antiguas de las herramientas por una línea que dice qué se hizo
 * (`read_file src/app.js: 3200 caracteres omitidos`) y acorta los argumentos
 * largos ya aplicados, de lo más antiguo a lo más reciente, hasta bajar a
 * `COMPACT_TARGET_RATIO * maxChars`. A diferencia de recortar turnos, el
 * modelo conserva el hilo completo (qué leyó, qué escribió, qué falló) y no
 * vuelve a explorar desde cero; y al mutar el historial persistente el
 * prefijo compactado se mantiene estable entre iteraciones.
 *
 * Devuelve los caracteres ahorrados (0 si no hizo nada).
 */
export function compactHistory(
  history: HarnessMessage[],
  maxChars: number,
): number {
  const before = historyChars(history);
  if (before <= maxChars) return 0;

  const target = maxChars * COMPACT_TARGET_RATIO;
  const calls = new Map<string, ChatToolCall>();
  for (const msg of history) {
    if (msg.role === "assistant") {
      for (const call of msg.toolCalls ?? []) calls.set(call.id, call);
    }
  }

  let total = before;
  const limit = history.length - KEEP_RECENT_MESSAGES;

  for (let i = 0; i < limit && total > target; i++) {
    const msg = history[i];
    if (!msg) continue;

    if (msg.role === "tool" && msg.content.length > COMPACT_MIN_CHARS) {
      const content = JSON.stringify({
        ok: !msg.content.startsWith('{"ok":false'),
        compacted:
          `${describeCall(calls.get(msg.toolCallId))}: salida de ` +
          `${msg.content.length} caracteres omitida para ahorrar contexto; ` +
          `repite la llamada solo si de verdad la necesitas`,
      });
      total -= msg.content.length - content.length;
      history[i] = { ...msg, content };
    } else if (msg.role === "assistant" && msg.toolCalls) {
      const toolCalls = msg.toolCalls.map(compactArguments);
      const compacted = { ...msg, toolCalls };
      total -= messageChars(msg) - messageChars(compacted);
      history[i] = compacted;
    }
  }

  return before - total;
}

/**
 * Último recurso si ni compactando cabe el historial (p. ej. los mensajes
 * recientes ya son enormes): conserva el system, el user inicial y los
 * últimos turnos, y resume el resto en una línea.
 */
export function pruneHistory(
  history: HarnessMessage[],
  maxChars: number,
): HarnessMessage[] {
  if (historyChars(history) <= maxChars) {
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

    // Compactar las salidas antiguas si el historial crece demasiado; solo
    // si ni así cabe, se recortan turnos.
    const saved = compactHistory(history, bounds.maxHistoryChars);
    if (saved > 0) {
      options.onOutput?.(`▸ historial compactado (−${saved} caracteres)`);
    }
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
