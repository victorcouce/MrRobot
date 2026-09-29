import { errorMessage } from "../agents/fallback.js";
import type { LimitRetryPolicy } from "../agents/limit-retry.js";
import { runRoleAgent } from "../agents/role.js";
import { maxComplexity } from "../agents/selector.js";
import type { AgentCandidate, OnAgentEvent } from "../agents/types.js";
import type { Project } from "../projects/types.js";
import type { TaskComplexity } from "../tasks/types.js";
import { supervisorDecisionSchema } from "./schema.js";
import type { SupervisorDecision } from "./types.js";

export interface SupervisorContext {
  trigger?: string;
  completedSinceLastCheck?: number;
  failureCount?: number;
  hasIntegrationConflict?: boolean;
}

export interface SupervisorDeps {
  execute?:
    | ((prompt: string, agent: AgentCandidate) => Promise<string>)
    | undefined;
  /** Agentes permitidos (del chat o del proyecto). Vacío = sin restricción. */
  allowedAgents?: AgentCandidate[] | undefined;
  complexity?: TaskComplexity | undefined;
  /** Reintentos por agente antes de pasar al siguiente de la cadena. */
  maxRetriesPerAgent?: number | undefined;
  /** Reintento de la cadena completa cuando todos caen por límite. */
  limitRetry?: Partial<LimitRetryPolicy> | undefined;
  /** Monitorización: inicio/éxito/fallo de cada intento, con duración. */
  onAgentEvent?: OnAgentEvent | undefined;
}

function summarize(project: Project): string {
  return project.tasks
    .map((task) => {
      const extra = task.blockedReason ? ` (${task.blockedReason})` : "";
      return `${task.id} [${task.status}] ${task.title}${extra}`;
    })
    .join("\n");
}

function buildPrompt(project: Project, context: SupervisorContext): string {
  const parts: string[] = [
    "Eres un supervisor de proyectos multiagente. Analiza el estado y decide el siguiente paso.",
    "",
    "OBJETIVO",
    project.goal,
    "",
    "ESTADO DE LAS TAREAS",
    summarize(project),
    "",
    `ESTADO DEL PROYECTO: ${project.status}`,
  ];

  if (context.trigger) parts.push("", `MOTIVO DE LA REVISIÓN: ${context.trigger}`);
  if (context.failureCount !== undefined) {
    parts.push(`FALLOS ACUMULADOS: ${context.failureCount}`);
  }
  if (context.hasIntegrationConflict) {
    parts.push("HAY CONFLICTOS DE INTEGRACIÓN GIT");
  }

  parts.push(
    "",
    "Responde EXCLUSIVAMENTE con JSON válido:",
    '{"action":"continue","reason":"..."}',
    '{"action":"replan","reason":"...","instructions":"..."}',
    '{"action":"pause","reason":"..."}',
    '{"action":"fail","reason":"..."}',
    "",
    "Usa replan si falta trabajo o hay que reorganizar; pause si no puedes decidir; fail si el objetivo es inalcanzable.",
  );

  return parts.join("\n");
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end < start) {
    return candidate.trim();
  }

  return candidate.slice(start, end + 1);
}

export async function superviseProject(
  project: Project,
  context: SupervisorContext = {},
  deps: SupervisorDeps = {},
): Promise<SupervisorDecision> {
  const complexity = deps.complexity ?? maxComplexity(project.tasks);

  try {
    const raw = await runRoleAgent(buildPrompt(project, context), "supervisor", {
      ...(deps.execute ? { execute: deps.execute } : {}),
      ...(deps.allowedAgents ? { allowedAgents: deps.allowedAgents } : {}),
      ...(complexity ? { complexity } : {}),
      ...(deps.maxRetriesPerAgent !== undefined
        ? { maxRetriesPerAgent: deps.maxRetriesPerAgent }
        : {}),
      ...(deps.limitRetry ? { limitRetry: deps.limitRetry } : {}),
      ...(deps.onAgentEvent ? { onAgentEvent: deps.onAgentEvent } : {}),
    });
    const json = JSON.parse(extractJson(raw)) as unknown;
    const parsed = supervisorDecisionSchema.safeParse(json);

    if (parsed.success) {
      const data = parsed.data;

      switch (data.action) {
        case "continue":
          return { action: "continue", reason: data.reason };
        case "pause":
          return { action: "pause", reason: data.reason };
        case "fail":
          return { action: "fail", reason: data.reason };
        case "replan":
          return data.instructions !== undefined
            ? {
                action: "replan",
                reason: data.reason,
                instructions: data.instructions,
              }
            : { action: "replan", reason: data.reason };
      }
    }

    return {
      action: "continue",
      reason: `decisión del supervisor inválida: ${parsed.error.message}`,
    };
  } catch (error) {
    return {
      action: "continue",
      reason: `supervisor no disponible: ${errorMessage(error)}`,
    };
  }
}
