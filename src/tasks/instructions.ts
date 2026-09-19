import { errorMessage } from "../agents/fallback.js";
import type { LimitRetryPolicy } from "../agents/limit-retry.js";
import { runRoleAgent } from "../agents/role.js";
import type { AgentCandidate, OnAgentEvent } from "../agents/types.js";
import { defaultConfig } from "../config/index.js";
import { taskInstructionSchema } from "./instructions-schema.js";
import type { Task, TaskComplexity } from "./types.js";

export interface TaskInstructionDeps {
  execute?: (prompt: string, agent: AgentCandidate) => Promise<string>;
  /** Agentes permitidos (del chat o del proyecto). Vacío = sin restricción. */
  allowedAgents?: AgentCandidate[];
  complexity?: TaskComplexity;
  maxAttempts?: number;
  /** Reintentos por agente antes de pasar al siguiente de la cadena. */
  maxRetriesPerAgent?: number;
  /** Reintento de la cadena completa cuando todos caen por límite. */
  limitRetry?: Partial<LimitRetryPolicy>;
  /** Monitorización: inicio/éxito/fallo de cada intento, con duración. */
  onAgentEvent?: OnAgentEvent;
}

export interface TaskInstructionMessage {
  role: "user" | "assistant";
  content: string;
}

export interface TaskInstructionOutcome {
  action: "proceed" | "ask";
  reply: string;
  questions?: string[];
}

/**
 * Protocolo de "instrucciones a una tarea": el usuario manda una instrucción y
 * el agente de la tarea decide si puede cambiar la aproximación (`proceed`) o si
 * necesita aclarar algo antes (`ask`). No ejecuta nada: solo conversa, para que
 * el usuario conduzca la recuperación y, si aún así no sirve, responda a las
 * preguntas que el agente le hace.
 */
const INSTRUCTION_SKILL = [
  "Eres un agente que trabaja en un proyecto. Una TAREA ha fallado y el",
  "usuario te envía una INSTRUCCIÓN para cambiar la aproximación. Tu trabajo es",
  "decidir cómo proceder y responderle con claridad.",
  "",
  "Reglas:",
  "- Si la instrucción es suficiente para cambiar la aproximación, responde",
  "  `action: \"proceed\"` y explica en `message` cómo vas a abordar la tarea de",
  "  forma distinta (en 1-3 frases, concreto).",
  "- Si necesitas aclarar algo antes de proceder (la instrucción es ambigua, falta",
  "  un dato de decisión del usuario, o la tarea es imposible tal cual), responde",
  "  `action: \"ask\"` con un `message` breve y de 1 a 3 preguntas concretas en",
  "  `questions`.",
  "- No ejecutes nada, no modifiques archivos y no inventes commits: solo decide",
  "  cómo proceder y responde.",
  "- No repitas preguntas que el historial ya haya resuelto.",
].join("\n");

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

function renderAttempts(task: Task): string {
  const attempts = task.attempts ?? [];
  if (attempts.length === 0) {
    return task.error ? `\nError de la tarea: ${task.error}` : "";
  }

  const lines = attempts.map((attempt) => {
    const agent =
      attempt.agent.provider === "codex"
        ? "Codex"
        : attempt.agent.provider === "claude"
          ? attempt.agent.model === "opus"
            ? "Claude Opus"
            : attempt.agent.model === "haiku"
              ? "Claude Haiku"
              : "Claude Sonnet"
          : attempt.agent.model === "deepseek-v4-pro"
            ? "DeepSeek V4 Pro"
            : "DeepSeek Flash";

    const status = attempt.status === "success" ? "ok" : `fallo: ${attempt.error ?? "sin detalle"}`;
    return `- Intento ${attempt.attempt} (${agent}): ${status}`;
  });

  return `\nIntentos previos:\n${lines.join("\n")}`;
}

function buildPrompt(
  task: Task,
  history: TaskInstructionMessage[],
  instruction: string,
): string {
  const criteria = task.acceptanceCriteria ?? [];
  const criteriaBlock =
    criteria.length > 0
      ? `\nCriterios de aceptación:\n${criteria.map((item) => `- ${item}`).join("\n")}`
      : "";

  const parts: string[] = [
    INSTRUCTION_SKILL,
    "",
    "TAREA",
    `ID: ${task.id}`,
    `Título: ${task.title}`,
    "",
    `Descripción: ${task.description}${criteriaBlock}`,
    renderAttempts(task),
  ];

  if (history.length > 0) {
    parts.push("", "CONVERSACIÓN HASTA AHORA");
    for (const message of history) {
      parts.push(
        `${message.role === "user" ? "Usuario" : "Agente"}: ${message.content}`,
      );
    }
  }

  parts.push(
    "",
    `INSTRUCCIÓN DEL USUARIO: ${instruction}`,
    "",
    "Responde EXCLUSIVAMENTE con un objeto JSON válido, sin texto adicional,",
    "con UNA de estas dos formas:",
    "",
    'Si puedes cambiar la aproximación: {"action":"proceed","message":"..."}',
    "",
    'Si necesitas aclarar algo: {"action":"ask","message":"...","questions":["...","..."]}',
  );

  return parts.join("\n");
}

export async function askTaskAgent(
  task: Task,
  history: TaskInstructionMessage[],
  instruction: string,
  deps: TaskInstructionDeps = {},
): Promise<TaskInstructionOutcome> {
  const maxAttempts = deps.maxAttempts ?? defaultConfig.plannerMaxAttempts;

  let feedback: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const raw = await runRoleAgent(
      buildPrompt(task, history, instruction),
      "instructions",
      {
        ...(deps.execute ? { execute: deps.execute } : {}),
        ...(deps.allowedAgents ? { allowedAgents: deps.allowedAgents } : {}),
        complexity: deps.complexity ?? task.complexity,
        ...(task.agent ? { preferred: task.agent } : {}),
        ...(deps.maxRetriesPerAgent !== undefined
          ? { maxRetriesPerAgent: deps.maxRetriesPerAgent }
          : {}),
        ...(deps.limitRetry ? { limitRetry: deps.limitRetry } : {}),
        ...(deps.onAgentEvent ? { onAgentEvent: deps.onAgentEvent } : {}),
      },
    );

    let parsed;
    try {
      parsed = taskInstructionSchema.parse(JSON.parse(extractJson(raw)));
    } catch (error) {
      feedback = `JSON inválido o fuera de esquema: ${errorMessage(error)}`;
      continue;
    }

    if (parsed.action === "proceed") {
      return { action: "proceed", reply: parsed.message };
    }

    return {
      action: "ask",
      reply: parsed.message,
      questions: parsed.questions,
    };
  }

  throw new Error(
    `El agente no generó una respuesta válida a la instrucción tras ${maxAttempts} intentos: ${feedback ?? "sin detalle"}.`,
  );
}
