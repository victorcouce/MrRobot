import { errorMessage } from "../agents/fallback.js";
import type { LimitRetryPolicy } from "../agents/limit-retry.js";
import { runRoleAgent } from "../agents/role.js";
import type { AgentCandidate } from "../agents/types.js";
import type { CheckResult } from "../checks/types.js";
import type { Task, TaskComplexity } from "../tasks/types.js";
import { reviewResultSchema } from "./schema.js";
import type { ReviewResult } from "./types.js";

export interface ReviewContext {
  diff?: string;
  output?: string;
  checks?: CheckResult[];
  acceptanceCriteria?: string[];
}

export interface ReviewerDeps {
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
}

function buildPrompt(task: Task, context: ReviewContext): string {
  const criteria = context.acceptanceCriteria ?? task.acceptanceCriteria ?? [];

  const parts: string[] = [
    "Eres un reviewer estricto. Decide si la tarea cumple sus criterios de aceptación.",
    "",
    `TAREA: ${task.id} - ${task.title}`,
    task.description,
  ];

  if (criteria.length > 0) {
    parts.push("", "CRITERIOS DE ACEPTACIÓN", ...criteria.map((c) => `- ${c}`));
  }

  if (context.output) {
    parts.push("", "RESULTADO DEL AGENTE", context.output);
  }

  if (context.checks?.length) {
    parts.push("", "CHECKS LOCALES");
    for (const check of context.checks) {
      parts.push(
        `${check.command}: ${check.success ? "OK" : "FALLO"}`,
        check.stdout ?? "",
        check.stderr ?? "",
      );
    }
  }

  if (context.diff) {
    parts.push("", "DIFF", context.diff);
  }

  parts.push(
    "",
    "Responde EXCLUSIVAMENTE con JSON válido con esta forma:",
    JSON.stringify(
      {
        approved: true,
        summary: "valoración breve",
        issues: [{ severity: "medium", description: "problema detectado" }],
        suggestedFixes: ["corrección sugerida"],
      },
      null,
      2,
    ),
    "",
    "approved debe ser false si algún criterio no se cumple o algún check falla.",
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

export async function reviewTask(
  task: Task,
  context: ReviewContext = {},
  deps: ReviewerDeps = {},
): Promise<ReviewResult> {
  try {
    const raw = await runRoleAgent(buildPrompt(task, context), "reviewer", {
      ...(deps.execute ? { execute: deps.execute } : {}),
      ...(deps.allowedAgents ? { allowedAgents: deps.allowedAgents } : {}),
      complexity: deps.complexity ?? task.complexity,
      ...(deps.maxRetriesPerAgent !== undefined
        ? { maxRetriesPerAgent: deps.maxRetriesPerAgent }
        : {}),
      ...(deps.limitRetry ? { limitRetry: deps.limitRetry } : {}),
    });
    const json = JSON.parse(extractJson(raw)) as unknown;
    const parsed = reviewResultSchema.safeParse(json);

    if (!parsed.success) {
      return {
        approved: false,
        summary: `review no parseable: ${parsed.error.message}`,
        issues: [
          { severity: "medium", description: "respuesta del reviewer inválida" },
        ],
      };
    }

    const result: ReviewResult = {
      approved: parsed.data.approved,
      summary: parsed.data.summary,
      issues: parsed.data.issues,
    };

    if (parsed.data.suggestedFixes) {
      result.suggestedFixes = parsed.data.suggestedFixes;
    }

    return result;
  } catch (error) {
    return {
      approved: false,
      summary: `review falló: ${errorMessage(error)}`,
      issues: [
        { severity: "medium", description: "no se pudo obtener el review" },
      ],
    };
  }
}
