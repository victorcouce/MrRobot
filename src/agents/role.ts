import type { Task, TaskComplexity, TaskType } from "../tasks/types.js";
import { classifyAvailability } from "./availability.js";
import {
  errorMessage,
  getFallbackChain,
  isRetryableError,
  MAX_RETRIES_PER_AGENT,
} from "./fallback.js";
import {
  isLimitReason,
  limitRetryDelayMs,
  resolveLimitRetry,
  sleep,
  type LimitRetryPolicy,
} from "./limit-retry.js";
import { runAgent } from "./router.js";
import { describeAgent } from "./selector.js";
import type { AgentCandidate } from "./types.js";

/**
 * Roles de orquestación que también necesitan elegir agente por complejidad y
 * hacer fallback. Comparten el mecanismo de las tareas (`getFallbackChain`),
 * mapeando cada rol a un tipo de tarea para reutilizar la misma matriz.
 */
export type OrchestrationRole =
  | "planner"
  | "reviewer"
  | "supervisor"
  | "grill"
  | "instructions";

const ROLE_TASK_TYPE: Record<OrchestrationRole, TaskType> = {
  planner: "planning",
  reviewer: "review",
  supervisor: "planning",
  grill: "research",
  instructions: "planning",
};

export interface RunRoleOptions {
  execute?: (prompt: string, agent: AgentCandidate) => Promise<string>;
  /** Agentes permitidos (del chat o del proyecto). Vacío = sin restricción. */
  allowedAgents?: AgentCandidate[];
  /** Complejidad que decide el tramo de la matriz de agentes. */
  complexity?: TaskComplexity;
  /** Agente preferido (p. ej. `task.agent`); va primero en la cadena. */
  preferred?: AgentCandidate;
  maxRetriesPerAgent?: number;
  /** Reintento de la cadena completa cuando todos caen por límite. */
  limitRetry?: Partial<LimitRetryPolicy> | undefined;
  signal?: AbortSignal;
  /** Notifica qué candidato completó la ejecución (para metadatos/eventos). */
  onAgent?: (agent: AgentCandidate) => void;
}

export function roleFallbackChain(
  role: OrchestrationRole,
  allowedAgents: AgentCandidate[] = [],
  complexity: TaskComplexity = "medium",
  preferred?: AgentCandidate,
): AgentCandidate[] {
  const pseudo = {
    type: ROLE_TASK_TYPE[role],
    complexity,
    ...(preferred ? { agent: preferred } : {}),
  } as Task;

  return getFallbackChain(pseudo, allowedAgents);
}

/**
 * Ejecuta un prompt de un rol de orquestación recorriendo la cadena de agentes.
 * Si un proveedor no está disponible (sin cuota, rate limit, auth o CLI
 * ausente) salta al siguiente sin reintentarlo; si el error es transitorio,
 * reintenta el mismo agente antes de pasar al siguiente. Si *todos* los
 * candidatos caen por límite, espera (respetando `retry after`) y vuelve a
 * recorrer la cadena hasta `limitRetry.maxLimitRetries`.
 */
export async function runRoleAgent(
  prompt: string,
  role: OrchestrationRole,
  options: RunRoleOptions = {},
): Promise<string> {
  const execute = options.execute ?? ((p, agent) => runAgent(p, agent));
  const chain = roleFallbackChain(
    role,
    options.allowedAgents ?? [],
    options.complexity,
    options.preferred,
  );
  const maxRetries = options.maxRetriesPerAgent ?? MAX_RETRIES_PER_AGENT;
  const limitRetry = resolveLimitRetry(options.limitRetry);

  let lastError: string | undefined;

  for (let cycle = 0; ; cycle++) {
    let allLimited = chain.length > 0;
    let limitError: unknown;

    for (const candidate of chain) {
      if (options.signal?.aborted) {
        throw new Error("Ejecución cancelada por el usuario.");
      }

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const output = await execute(prompt, candidate);
          options.onAgent?.(candidate);
          return output;
        } catch (error) {
          lastError = errorMessage(error);

          const availability = classifyAvailability(error);

          // Proveedor agotado o inaccesible: no insistir, pasar al siguiente.
          if (!availability.available) {
            if (isLimitReason(availability.reason)) {
              limitError = error;
            } else {
              allLimited = false;
            }
            console.log(
              `↪ ${describeAgent(candidate)} no disponible (${availability.reason}), siguiente agente.`,
            );
            break;
          }

          // Cualquier fallo que no sea límite descarta el reintento de cadena.
          allLimited = false;

          if (!isRetryableError(error)) {
            console.log(
              `✗ ${describeAgent(candidate)} error no reintentable, siguiente agente.`,
            );
            break;
          }

          if (attempt < maxRetries) {
            console.log(`↻ reintento ${describeAgent(candidate)}`);
          }
        }
      }
    }

    if (!allLimited || cycle >= limitRetry.maxLimitRetries) {
      break;
    }

    const delay = limitRetryDelayMs(cycle, limitError, limitRetry);
    console.log(
      `⏳ todos los agentes al límite; reintentando la cadena en ${Math.round(delay / 1000)}s (${cycle + 1}/${limitRetry.maxLimitRetries}).`,
    );
    await sleep(delay, options.signal);
  }

  throw new Error(
    `Ningún agente pudo completar el rol "${role}": ${lastError ?? "sin candidatos"}.`,
  );
}
