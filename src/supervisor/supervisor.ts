import { errorMessage } from "../agents/fallback.js";
import { runAgent } from "../agents/router.js";
import type { AgentCandidate } from "../agents/types.js";
import { defaultConfig } from "../config/index.js";
import type { Project } from "../projects/types.js";
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
  agent?: AgentCandidate | undefined;
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
  const execute =
    deps.execute ?? ((prompt, agent) => runAgent(prompt, agent));
  const agent = deps.agent ?? defaultConfig.supervisorAgent;

  try {
    const raw = await execute(buildPrompt(project, context), agent);
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
