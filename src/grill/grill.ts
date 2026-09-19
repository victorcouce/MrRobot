import { errorMessage } from "../agents/fallback.js";
import type { LimitRetryPolicy } from "../agents/limit-retry.js";
import { runRoleAgent } from "../agents/role.js";
import type { AgentCandidate } from "../agents/types.js";
import { defaultConfig } from "../config/index.js";
import type { TaskComplexity } from "../tasks/types.js";
import { grillResponseSchema } from "./schema.js";
import type { GrillMessage, GrillOutcome, GrillQuestion } from "./types.js";

export interface GrillDeps {
  execute?: (prompt: string, agent: AgentCandidate) => Promise<string>;
  /** Agentes permitidos (del chat o del proyecto). Vacío = sin restricción. */
  allowedAgents?: AgentCandidate[];
  complexity?: TaskComplexity;
  maxAttempts?: number;
  /** Reintentos por agente antes de pasar al siguiente de la cadena. */
  maxRetriesPerAgent?: number;
  /** Reintento de la cadena completa cuando todos caen por límite. */
  limitRetry?: Partial<LimitRetryPolicy>;
}

/**
 * Protocolo del skill `grill-me` (mattpocock/skills), incrustado en la herramienta.
 * Entrevista implacable al usuario para llegar a un entendimiento compartido
 * del objetivo antes de planificar nada.
 */
const GRILLING_SKILL = [
  "Eres un entrevistador implacable (\"grill\"). Tu trabajo es entrevistar al usuario",
  "hasta llegar a un entendimiento compartido sobre su objetivo antes de construir nada.",
  "",
  "Modela el objetivo como un ÁRBOL DE DISEÑO: cada decisión ramifica en las",
  "decisiones que cuelgan de ella. Trabaja el árbol en RONDAS.",
  "",
  "La FRONTERA es el conjunto de decisiones cuyos prerrequisitos ya están resueltos:",
  "las preguntas que puedes hacer AHORA sin adivinar respuestas que aún no has oído.",
  "",
  "Reglas:",
  "- En cada ronda pregunta TODA la frontera a la vez: numera cada pregunta y da tu",
  "  respuesta recomendada.",
  "- Haz el MÍNIMO de preguntas: intenta resolverlo todo en una sola ronda y solo",
  "  añade otra si algo es estrictamente necesario y no puede asumirse.",
  "- Encontrar HECHOS es tu trabajo, nunca el del usuario. No le pidas datos que puedas",
  "  inferir o asumir: decide tú y ofrécelo como recomendación.",
  "- Las DECISIONES son del usuario: plantéalas todas y espera sus respuestas.",
  "- Una pregunta cuya respuesta depende de otra que sigue abierta en esta ronda",
  "  pertenece a una ronda posterior, no a esta.",
  "- La entrevista termina cuando la frontera está vacía: todas las ramas visitadas,",
  "  nada queda asumido en silencio. Entonces resume el entendimiento compartido.",
  "",
  "CONTEXTO DE ENTREGA",
  "- El OBJETIVO es un proyecto NUEVO del usuario, construido desde cero y totalmente",
  "  independiente.",
  "- El directorio de trabajo actual pertenece a otra aplicación (la que te ejecuta),",
  "  NO al proyecto objetivo. No lo inspecciones ni asumas que el proyecto comparte su",
  "  código, su estructura ni su stack.",
  "- No preguntes dónde vive el proyecto dentro del repositorio actual ni propongas",
  "  integrarlo en carpetas como src/ o ui/ del repositorio actual.",
  "- Nunca menciones la herramienta que te ejecuta ni el repositorio actual en las",
  "  preguntas, opciones, recomendaciones ni en el resumen final: el objetivo es un",
  "  proyecto autónomo y el resumen debe hablar solo de él.",
].join("\n");

function renderQuestions(
  round: number,
  questions: GrillQuestion[],
): string {
  const lines: string[] = [`Ronda ${round}`];

  for (const question of questions) {
    lines.push(
      "",
      `${question.id} — ${question.title}: ${question.body}`,
    );

    for (const option of question.options ?? []) {
      lines.push(`   - ${option}`);
    }

    lines.push(`➡️ Recomendado: ${question.recommendation}`);
  }

  return lines.join("\n");
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

function buildPrompt(
  goal: string,
  messages: GrillMessage[],
  round: number,
  feedback?: string,
  target?: string,
): string {
  const parts: string[] = [
    GRILLING_SKILL,
    "",
    "OBJETIVO",
    goal,
  ];

  if (target) {
    parts.push(
      "",
      `CARPETA DEL PROYECTO: ${target}`,
      "Es un proyecto nuevo en su propia carpeta; no comparte código con el repositorio actual.",
    );
  }

  if (messages.length > 0) {
    parts.push("", "CONVERSACIÓN HASTA AHORA");
    for (const message of messages) {
      parts.push(`${message.role === "user" ? "Usuario" : "Grill"}: ${message.content}`);
    }
  }

  if (feedback) {
    parts.push(
      "",
      "EL INTENTO ANTERIOR NO FUE VÁLIDO",
      feedback,
      "Corrige el problema y devuelve una respuesta válida.",
    );
  }

  parts.push(
    "",
    `Es tu turno: calcula la frontera actual (ronda ${round}) y responde EXCLUSIVAMENTE`,
    "con un objeto JSON válido, sin texto adicional, con UNA de estas dos formas:",
    "",
    "Si aún quedan preguntas en la frontera:",
    JSON.stringify(
      {
        done: false,
        questions: [
          {
            id: "Q1",
            title: "título corto de la pregunta",
            body: "cuerpo de la pregunta, con el contexto necesario",
            options: ["alternativa A", "alternativa B", "alternativa C"],
            recommendation: "tu respuesta recomendada",
          },
        ],
      },
      null,
      2,
    ),
    "",
    "Si la frontera está vacía (entendimiento compartido alcanzado):",
    JSON.stringify(
      {
        done: true,
        summary:
          "Objetivo:\n- resumen en una frase\n\nStack:\n- decisión\n- decisión\n\nEntrega:\n- decisión",
      },
      null,
      2,
    ),
    "",
    "Reglas: numera las preguntas de forma estable (Q1, Q2…); si es la primera ronda",
    "empieza en Q1; no repitas preguntas ya respondidas; no hagas preguntas cuyas",
    "respuestas dependan de otras que siguen abiertas.",
    "Haz el MÍNIMO de preguntas: solo lo estrictamente necesario para entender el",
    "objetivo y asume el resto con una recomendación sensata. Resuelve todo en UNA",
    "sola ronda siempre que puedas; añade otra ronda solo si es imprescindible.",
    "Cuando la decisión tenga alternativas discretas, incluye `options` (2-4), cada",
    "una como texto corto y autocontenido. Haz que la PRIMERA opción de `options`",
    "sea tu `recommendation`. Si la decisión es abierta, omite `options`.",
    "FORMATO DE `summary`: no escribas un párrafo corrido. Devuelve una lista",
    "escaneable con una sección por tema; el título de cada sección va en su propia",
    "línea terminado en «:» (por ejemplo «Objetivo:», «Stack:», «Alcance:», «Entrega»)",
    "y debajo una decisión por línea empezando por «- ». Frases cortas y concretas.",
  );

  return parts.join("\n");
}

export async function runGrill(
  goal: string,
  messages: GrillMessage[],
  deps: GrillDeps = {},
  target?: string,
): Promise<GrillOutcome> {
  const maxAttempts = deps.maxAttempts ?? defaultConfig.plannerMaxAttempts;
  const round = messages.filter((message) => message.role === "assistant").length + 1;

  let feedback: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const raw = await runRoleAgent(
      buildPrompt(goal, messages, round, feedback, target),
      "grill",
      {
        ...(deps.execute ? { execute: deps.execute } : {}),
        ...(deps.allowedAgents ? { allowedAgents: deps.allowedAgents } : {}),
        ...(deps.complexity ? { complexity: deps.complexity } : {}),
        ...(deps.maxRetriesPerAgent !== undefined
          ? { maxRetriesPerAgent: deps.maxRetriesPerAgent }
          : {}),
        ...(deps.limitRetry ? { limitRetry: deps.limitRetry } : {}),
      },
    );

    let parsed;
    try {
      parsed = grillResponseSchema.parse(JSON.parse(extractJson(raw)));
    } catch (error) {
      feedback = `JSON inválido o fuera de esquema: ${errorMessage(error)}`;
      continue;
    }

    if (parsed.done) {
      return { status: "done", summary: parsed.summary };
    }

    return {
      status: "questions",
      questions: parsed.questions,
      message: renderQuestions(round, parsed.questions),
    };
  }

  throw new Error(
    `El grill no generó una respuesta válida tras ${maxAttempts} intentos: ${feedback ?? "sin detalle"}.`,
  );
}
