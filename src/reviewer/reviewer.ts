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
import type { z } from "zod";
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

// El reviewer no tiene herramientas (ver `reviewTask`): decide con lo que va en
// el prompt, así que el diff es su fuente principal. Aun así se acota: un diff
// enorme dominaría el coste sin mejorar el veredicto.
export const MAX_REVIEW_DIFF_CHARS = 40_000;
export const MAX_REVIEW_OUTPUT_CHARS = 3_000;

function clip(value: string, max: number, keep: "head" | "tail"): string {
  if (value.length <= max) return value;
  const omitted = `[… ${value.length - max} caracteres omitidos …]`;
  return keep === "head"
    ? `${value.slice(0, max)}\n${omitted}`
    : `${omitted}\n${value.slice(-max)}`;
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
    "No tienes herramientas: evalúa los criterios solo con el DIFF del commit de la tarea, los CHECKS LOCALES y el RESULTADO DEL AGENTE de abajo. Las rutas de los criterios son relativas a la raíz del repositorio. Lo que no se pueda comprobar con esa información no es motivo de rechazo, salvo que el diff lo contradiga.",
  ];

  if (criteria.length > 0) {
    parts.push("", "CRITERIOS DE ACEPTACIÓN", ...criteria.map((c) => `- ${c}`));
  }

  if (context.output) {
    parts.push(
      "",
      "RESULTADO DEL AGENTE",
      clip(context.output, MAX_REVIEW_OUTPUT_CHARS, "tail"),
    );
  }

  if (context.checks?.length) {
    parts.push("", "CHECKS LOCALES");
    for (const check of context.checks) {
      if (check.success) {
        parts.push(`${check.command}: OK`);
        continue;
      }

      parts.push(`${check.command}: FALLO`);
      if (check.stdout) parts.push(check.stdout);
      if (check.stderr) parts.push(check.stderr);
    }
  }

  if (context.diff) {
    parts.push("", "DIFF", clip(context.diff, MAX_REVIEW_DIFF_CHARS, "head"));
  }

  parts.push("", JSON_INSTRUCTIONS);

  return parts.join("\n");
}

const JSON_INSTRUCTIONS = [
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
].join("\n");

/**
 * Si la respuesta no era JSON válido, se pide solo reformatearla: repetir el
 * prompt entero volvía a pagar la revisión completa (el 22-09, 1,1M tokens de
 * Sonnet por cada vuelta).
 */
function buildReformatPrompt(raw: string): string {
  return [
    "Convierte esta valoración de un reviewer al formato pedido, sin cambiar su veredicto ni añadir nada.",
    "",
    "VALORACIÓN",
    clip(raw, 4_000, "tail"),
    "",
    JSON_INSTRUCTIONS,
  ].join("\n");
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

type ParsedReview =
  | { success: true; data: z.infer<typeof reviewResultSchema> }
  | { success: false; error: string };

function parseReview(raw: string): ParsedReview {
  let json: unknown;

  try {
    json = JSON.parse(extractJson(raw));
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }

  const parsed = reviewResultSchema.safeParse(json);
  return parsed.success
    ? { success: true, data: parsed.data }
    : { success: false, error: parsed.error.message };
}

export async function reviewTask(
  task: Task,
  context: ReviewContext = {},
  deps: ReviewerDeps = {},
): Promise<ReviewResult> {
  const base =
    deps.execute ?? ((prompt, agent, options) => runAgent(prompt, agent, options));

  // Sin herramientas: con ellas, el CLI de Claude recorría el worktree en cada
  // revisión (el 22-09, de 2 a 3 min y ~1,1M tokens de entrada por review)
  // aunque el diff y los checks ya estaban en el prompt. El cwd se mantiene en
  // el worktree de la tarea por si algún proveedor lo usa.
  const cwd = deps.cwd;
  const execute = (prompt: string, agent: AgentCandidate) =>
    base(prompt, agent, { ...(cwd ? { cwd } : {}), tools: "none" });

  const ask = (prompt: string): Promise<string> =>
    runRoleAgent(prompt, "reviewer", {
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

  try {
    const prompt = buildPrompt(task, context);
    const raw = await ask(prompt);
    let parsed = parseReview(raw);

    // Reformatear es mucho más barato que el ciclo de fix del worker que
    // dispararía un rechazo por formato, y que repetir la revisión.
    if (!parsed.success) {
      parsed = parseReview(await ask(buildReformatPrompt(raw)));
    }

    if (!parsed.success) {
      return {
        approved: false,
        unavailable: true,
        summary: `review no parseable: ${parsed.error}`,
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
      unavailable: true,
      summary: `review falló: ${errorMessage(error)}`,
      issues: [
        { severity: "medium", description: "no se pudo obtener el review" },
      ],
    };
  }
}
