import { errorMessage } from "../agents/fallback.js";
import type { AgentHealth } from "../agents/health.js";
import type { LimitRetryPolicy } from "../agents/limit-retry.js";
import { runRoleAgent } from "../agents/role.js";
import { runAgent } from "../agents/router.js";
import type { AgentCandidate, OnAgentEvent } from "../agents/types.js";
import type { CheckResult } from "../checks/types.js";
import type { RunOptions } from "../providers/types.js";
import { normalizeCriteria } from "../tasks/criteria.js";
import type { Task, TaskComplexity } from "../tasks/types.js";
import { reviewResultSchema } from "./schema.js";
import type { ReviewResult } from "./types.js";

export interface ReviewContext {
  diff?: string;
  output?: string;
  checks?: CheckResult[];
  acceptanceCriteria?: string[];
  /** Raíz del repo para reanclar criterios con rutas absolutas a relativas. */
  repoRoot?: string;
}

export interface ReviewerDeps {
  execute?:
    | ((
        prompt: string,
        agent: AgentCandidate,
        options?: RunOptions,
      ) => Promise<string>)
    | undefined;
  /** Directorio donde el reviewer inspecciona el resultado (worktree). */
  cwd?: string | undefined;
  /** Agentes permitidos (del chat o del proyecto). Vacío = sin restricción. */
  allowedAgents?: AgentCandidate[] | undefined;
  /** Memoria compartida de agentes agotados por límite (rate limit/cuota). */
  agentHealth?: AgentHealth | undefined;
  complexity?: TaskComplexity | undefined;
  /** Reintentos por agente antes de pasar al siguiente de la cadena. */
  maxRetriesPerAgent?: number | undefined;
  /** Reintento de la cadena completa cuando todos caen por límite. */
  limitRetry?: Partial<LimitRetryPolicy> | undefined;
  /** Monitorización: inicio/éxito/fallo de cada intento, con duración. */
  onAgentEvent?: OnAgentEvent | undefined;
}

function buildPrompt(task: Task, context: ReviewContext): string {
  const criteria = normalizeCriteria(
    context.acceptanceCriteria ?? task.acceptanceCriteria ?? [],
    context.repoRoot,
  );

  const parts: string[] = [
    "Eres un reviewer estricto. Decide si la tarea cumple sus criterios de aceptación.",
    "",
    `TAREA: ${task.id} - ${task.title}`,
    task.description,
    "",
    "El DIFF describe el commit de la tarea y el directorio de trabajo actual contiene ese resultado; evalúa los criterios ahí. Las rutas de los criterios son relativas a la raíz del repositorio.",
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
  const base =
    deps.execute ?? ((prompt, agent, options) => runAgent(prompt, agent, options));

  // El reviewer inspecciona el resultado en el worktree de la tarea: se fuerza
  // el cwd por encima del que traiga el ejecutor (que apunta al repo principal).
  const cwd = deps.cwd;
  const execute = cwd
    ? (prompt: string, agent: AgentCandidate) => base(prompt, agent, { cwd })
    : base;

  try {
    const raw = await runRoleAgent(buildPrompt(task, context), "reviewer", {
      execute,
      ...(deps.allowedAgents ? { allowedAgents: deps.allowedAgents } : {}),
      ...(deps.agentHealth ? { agentHealth: deps.agentHealth } : {}),
      complexity: deps.complexity ?? task.complexity,
      ...(deps.maxRetriesPerAgent !== undefined
        ? { maxRetriesPerAgent: deps.maxRetriesPerAgent }
        : {}),
      ...(deps.limitRetry ? { limitRetry: deps.limitRetry } : {}),
      ...(deps.onAgentEvent ? { onAgentEvent: deps.onAgentEvent } : {}),
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
