import { errorMessage } from "../agents/fallback.js";
import { runAgent } from "../agents/router.js";
import type { AgentCandidate } from "../agents/types.js";
import { defaultConfig } from "../config/index.js";
import {
  findCycle,
  findDuplicateIds,
  findMissingDependencies,
} from "../scheduler/validation.js";
import { generatedPlanSchema } from "./schema.js";
import type { GeneratedPlan, PlanContext } from "./types.js";

export interface PlannerDeps {
  execute?:
    | ((prompt: string, agent: AgentCandidate) => Promise<string>)
    | undefined;
  agent?: AgentCandidate | undefined;
  maxAttempts?: number | undefined;
}

export function validateGeneratedPlan(plan: GeneratedPlan): string[] {
  const problems: string[] = [];

  if (plan.tasks.length === 0) {
    problems.push("el plan no contiene tareas");
  }

  const duplicates = findDuplicateIds(plan.tasks);

  if (duplicates.length > 0) {
    problems.push(`IDs duplicados: ${duplicates.join(", ")}`);
  }

  problems.push(...findMissingDependencies(plan.tasks));

  const cycle = findCycle(plan.tasks);

  if (cycle) {
    problems.push(`dependencia circular: ${cycle.join(" → ")}`);
  }

  return problems;
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

function parsePlan(
  raw: string,
): { ok: true; plan: GeneratedPlan } | { ok: false; error: string } {
  try {
    const json = JSON.parse(extractJson(raw)) as unknown;
    const result = generatedPlanSchema.safeParse(json);

    if (!result.success) {
      return {
        ok: false,
        error: `el JSON no cumple el esquema: ${result.error.message}`,
      };
    }

    return { ok: true, plan: result.data };
  } catch (error) {
    return { ok: false, error: `JSON inválido: ${errorMessage(error)}` };
  }
}

function buildPrompt(
  goal: string,
  context: PlanContext,
  feedback?: string,
): string {
  const parts: string[] = [
    "Eres un planner experto en descomponer objetivos de software en tareas ejecutables por agentes.",
    "",
    "OBJETIVO",
    goal,
  ];

  if (context.previousPlan) {
    parts.push(
      "",
      "PLAN ACTUAL",
      JSON.stringify(context.previousPlan, null, 2),
    );
  }

  if (context.completedTaskIds?.length) {
    parts.push(
      "",
      `TAREAS YA COMPLETADAS (no las repitas): ${context.completedTaskIds.join(", ")}`,
    );
  }

  if (context.failedTaskIds?.length) {
    parts.push(
      "",
      `TAREAS FALLIDAS: ${context.failedTaskIds.join(", ")}`,
    );
  }

  if (context.supervisorReason) {
    parts.push("", `MOTIVO DEL SUPERVISOR: ${context.supervisorReason}`);
  }

  if (context.instructions) {
    parts.push("", `INSTRUCCIONES: ${context.instructions}`);
  }

  if (feedback) {
    parts.push(
      "",
      "EL INTENTO ANTERIOR NO FUE VÁLIDO",
      feedback,
      "Corrige el problema y devuelve un plan válido.",
    );
  }

  parts.push(
    "",
    "Responde EXCLUSIVAMENTE con un objeto JSON válido, sin texto adicional, con esta forma:",
    JSON.stringify(
      {
        summary: "resumen breve del plan",
        tasks: [
          {
            id: "TASK-001",
            title: "título corto",
            description: "qué debe hacer el agente",
            type: "coding",
            complexity: "medium",
            dependsOn: [],
            acceptanceCriteria: ["criterio verificable"],
          },
        ],
      },
      null,
      2,
    ),
    "",
    "Reglas: IDs únicos; dependsOn solo referencia IDs existentes; sin ciclos; al menos una tarea sin dependencias; type y complexity deben ser valores válidos.",
  );

  return parts.join("\n");
}

export async function planProject(
  goal: string,
  context: PlanContext = {},
  deps: PlannerDeps = {},
): Promise<GeneratedPlan> {
  const execute =
    deps.execute ?? ((prompt, agent) => runAgent(prompt, agent));
  const agent = deps.agent ?? defaultConfig.plannerAgent;
  const maxAttempts = deps.maxAttempts ?? defaultConfig.plannerMaxAttempts;

  let feedback: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const raw = await execute(buildPrompt(goal, context, feedback), agent);
    const parsed = parsePlan(raw);

    if (!parsed.ok) {
      feedback = parsed.error;
      continue;
    }

    const problems = validateGeneratedPlan(parsed.plan);

    if (problems.length === 0) {
      return parsed.plan;
    }

    feedback = problems.join("; ");
  }

  throw new Error(
    `El planner no generó un plan válido tras ${maxAttempts} intentos: ${feedback ?? "sin detalle"}.`,
  );
}
