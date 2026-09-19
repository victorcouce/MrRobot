import { renderAttachments } from "../agents/attachments.js";
import { errorMessage } from "../agents/fallback.js";
import type { LimitRetryPolicy } from "../agents/limit-retry.js";
import { runRoleAgent } from "../agents/role.js";
import { maxComplexity } from "../agents/selector.js";
import type { AgentCandidate } from "../agents/types.js";
import { defaultConfig } from "../config/index.js";
import {
  findCycle,
  findDuplicateIds,
  findMissingDependencies,
} from "../scheduler/validation.js";
import type { TaskComplexity } from "../tasks/types.js";
import { generatedPlanSchema } from "./schema.js";
import type { GeneratedPlan, PlanContext } from "./types.js";

export interface PlannerDeps {
  execute?:
    | ((prompt: string, agent: AgentCandidate) => Promise<string>)
    | undefined;
  /** Agentes permitidos (del chat o del proyecto). Vacío = sin restricción. */
  allowedAgents?: AgentCandidate[] | undefined;
  complexity?: TaskComplexity | undefined;
  maxAttempts?: number | undefined;
  /** Reintentos por agente antes de pasar al siguiente de la cadena. */
  maxRetriesPerAgent?: number | undefined;
  /** Reintento de la cadena completa cuando todos caen por límite. */
  limitRetry?: Partial<LimitRetryPolicy> | undefined;
  /** Notifica qué agente generó el plan (para metadatos del mensaje de chat). */
  onAgent?: ((agent: AgentCandidate) => void) | undefined;
}

/**
 * Frases que delatan una verificación que un agente no puede ejecutar: exige
 * interacción humana, un navegador real o inspección visual. El reviewer pide
 * evidencia real de estos criterios, así que una tarea así nunca se aprueba.
 */
const MANUAL_VERIFICATION_PATTERNS: RegExp[] = [
  /\bmanual(?:mente)?\b/i,
  /\ba mano\b/i,
  /inspecci[oó]n visual/i,
  /captura(?:s)? de pantalla/i,
  /consola del navegador/i,
  /revis(?:ar|ión) (?:visual|manualmente)/i,
];

function findManualVerification(tasks: GeneratedPlan["tasks"]): string[] {
  return tasks
    .filter((task) =>
      (task.acceptanceCriteria ?? []).some((criterion) =>
        MANUAL_VERIFICATION_PATTERNS.some((pattern) => pattern.test(criterion)),
      ),
    )
    .map((task) => task.id);
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

  const manual = findManualVerification(plan.tasks);

  if (manual.length > 0) {
    problems.push(
      `criterios de verificación manual no automatizables en ${manual.join(", ")}: ` +
        "reformúlalos como comandos o tests ejecutables por un agente (nada de pasos manuales, navegador real ni inspección visual)",
    );
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

  if (context.conversation?.length) {
    parts.push("", "CONVERSACIÓN HASTA AHORA");
    for (const message of context.conversation) {
      parts.push(`${message.role === "user" ? "Usuario" : "Planner"}: ${message.content}`);
    }
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

  if (context.attachments?.length) {
    parts.push(...renderAttachments(context.attachments));
    parts.push(
      "",
      'Si una tarea necesita alguno de estos adjuntos, indícalo en su campo "attachments" con la referencia entre corchetes (por ejemplo ["ADJ-1"]). Déjalo vacío si no hace falta ninguno.',
    );
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
            attachments: [],
          },
        ],
      },
      null,
      2,
    ),
    "",
    "Reglas: IDs únicos; dependsOn solo referencia IDs existentes; sin ciclos; al menos una tarea sin dependencias; type y complexity deben ser valores válidos.",
    "Cada tarea debe poder completarla un agente que escribe archivos y ejecuta comandos.",
    "Los criterios de aceptación deben poder comprobarse automáticamente sobre el repositorio (comandos, tests). No crees tareas ni criterios de verificación manual, interacción con un navegador real, inspección visual ni capturas: no son verificables. Si hace falta validar la UI, pide tests automatizados que se ejecuten con un comando.",
  );

  return parts.join("\n");
}

export async function planProject(
  goal: string,
  context: PlanContext = {},
  deps: PlannerDeps = {},
): Promise<GeneratedPlan> {
  const maxAttempts = deps.maxAttempts ?? defaultConfig.plannerMaxAttempts;
  // Al replanificar, la complejidad del plan anterior marca el tramo de agentes.
  const complexity =
    deps.complexity ?? maxComplexity(context.previousPlan?.tasks ?? []);

  let feedback: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const raw = await runRoleAgent(buildPrompt(goal, context, feedback), "planner", {
      ...(deps.execute ? { execute: deps.execute } : {}),
      ...(deps.allowedAgents ? { allowedAgents: deps.allowedAgents } : {}),
      ...(complexity ? { complexity } : {}),
      ...(deps.maxRetriesPerAgent !== undefined
        ? { maxRetriesPerAgent: deps.maxRetriesPerAgent }
        : {}),
      ...(deps.limitRetry ? { limitRetry: deps.limitRetry } : {}),
      ...(deps.onAgent ? { onAgent: deps.onAgent } : {}),
    });
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
