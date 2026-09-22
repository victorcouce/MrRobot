import type { ProjectEvent } from "../storage/types.js";

/** Métricas agregadas de los intentos de agente (espejo de `shared/types.ts`). */
export interface AgentMetric {
  scope: string;
  agent: string;
  attempts: number;
  ok: number;
  failed: number;
  totalMs: number;
  /** Tokens de entrada (incluida la parte cacheada) y de salida. */
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

export interface FailureMetric {
  reason: string;
  count: number;
}

export interface MetricsSummary {
  projects: number;
  agentRuns: AgentMetric[];
  tasks: { attempts: number; completed: number; failed: number };
  replans: number;
  topFailures: FailureMetric[];
}

/**
 * Clasifica el error de un intento de agente en una categoría legible para el
 * panel de actividad. Es heurístico: solo agrupa por el patrón más relevante.
 */
function classifyFailure(message: string): string {
  const m = message.toLowerCase();

  if (m.includes("agotadas") && m.includes("iteraciones")) {
    return "harness: iteraciones";
  }
  if (m.includes("máximo de llamadas")) return "harness: tool calls";
  if (m.includes("role 'tool'")) return "API: tool huérfano (400)";
  if (m.includes("symlink")) return "sandbox: symlink";
  if (m.includes("ruta fuera de la raíz")) return "sandbox: ruta fuera";
  if (m.includes("no permitido")) return "sandbox: comando no permitido";
  if (m.includes("vetado")) return "sandbox: comando vetado";
  if (m.includes(".git")) return "sandbox: .git";
  if (m.includes("no creó ni modificó")) return "agente sin cambios";
  if (m.includes("rate limit") || m.includes("session limit") || m.includes("429")) {
    return "rate limit";
  }
  if (m.includes("no disponible")) return "agente no disponible";

  return "otros";
}

interface AgentPayload {
  scope?: string;
  agent?: string;
  durationMs?: number;
  error?: string;
  usage?: { input?: number; cachedInput?: number; output?: number };
}

function payloadOf(event: ProjectEvent): AgentPayload {
  return (event.payload ?? {}) as AgentPayload;
}

/**
 * Agrega los eventos de todos los proyectos en un resumen de métricas: tiempo y
 * tasa de éxito por agente, intentos/fallos de tareas, replans y causas de
 * fallo. Función pura para poder testearla sin storage.
 */
export function computeMetrics(
  eventsByProject: ProjectEvent[][],
): MetricsSummary {
  const runs = new Map<string, AgentMetric>();
  const failures = new Map<string, number>();
  let taskAttempts = 0;
  let taskCompleted = 0;
  let taskFailed = 0;
  let replans = 0;

  for (const events of eventsByProject) {
    for (const event of events) {
      switch (event.type) {
        case "task.started":
          taskAttempts++;
          break;
        case "task.completed":
          taskCompleted++;
          break;
        case "task.failed":
          taskFailed++;
          break;
        case "supervisor.replan":
          replans++;
          break;
        default:
          break;
      }

      if (event.type === "agent.failed") {
        const reason = classifyFailure(payloadOf(event).error ?? "");
        failures.set(reason, (failures.get(reason) ?? 0) + 1);
      }

      if (
        event.type !== "agent.started" &&
        event.type !== "agent.completed" &&
        event.type !== "agent.failed"
      ) {
        continue;
      }

      const payload = payloadOf(event);
      const scope = payload.scope ?? "?";
      const agent = payload.agent ?? "?";
      const key = `${scope}|${agent}`;
      const metric =
        runs.get(key) ??
        ({
          scope,
          agent,
          attempts: 0,
          ok: 0,
          failed: 0,
          totalMs: 0,
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0,
        } as AgentMetric);

      if (event.type === "agent.started") metric.attempts++;
      if (event.type === "agent.completed") {
        metric.ok++;
        metric.totalMs += payload.durationMs ?? 0;
      }
      if (event.type === "agent.failed") {
        metric.failed++;
        metric.totalMs += payload.durationMs ?? 0;
      }
      if (payload.usage) {
        metric.inputTokens += payload.usage.input ?? 0;
        metric.cachedInputTokens += payload.usage.cachedInput ?? 0;
        metric.outputTokens += payload.usage.output ?? 0;
      }

      runs.set(key, metric);
    }
  }

  const topFailures: FailureMetric[] = [...failures.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  return {
    projects: eventsByProject.length,
    agentRuns: [...runs.values()].sort(
      (a, b) => b.attempts - a.attempts || b.totalMs - a.totalMs,
    ),
    tasks: { attempts: taskAttempts, completed: taskCompleted, failed: taskFailed },
    replans,
    topFailures,
  };
}
