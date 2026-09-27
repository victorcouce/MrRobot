import { renderAttachments } from "../agents/attachments.js";
import type { LimitRetryPolicy } from "../agents/limit-retry.js";
import { runRoleAgent } from "../agents/role.js";
import type { AgentCandidate, Attachment } from "../agents/types.js";

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ConversationDeps {
  execute?: (prompt: string, agent: AgentCandidate) => Promise<string>;
  /** Sustituye al agente real (modo simulado). */
  reply?: (messages: ConversationMessage[]) => Promise<string> | string;
  /** Agentes permitidos del chat. Vacío = sin restricción. */
  allowedAgents?: AgentCandidate[];
  attachments?: Attachment[];
  maxRetriesPerAgent?: number;
  limitRetry?: Partial<LimitRetryPolicy>;
  onAgent?: (agent: AgentCandidate) => void;
}

/**
 * Un chat suelto no tiene proyecto: el agente conversa (idear, preguntar,
 * explicar) sin repo, sin plan y sin tocar archivos. Cuando la idea madura, el
 * usuario mueve el chat a un proyecto y la conversación pasa al planner.
 */
const CONVERSATION_SKILL = [
  "Eres MrRobot, un asistente de desarrollo de software. Estás en un chat suelto,",
  "sin proyecto: conversa con el usuario, responde a sus preguntas, ayuda a",
  "idear y a aterrizar lo que quiere construir.",
  "",
  "Reglas:",
  "- Responde en el idioma del usuario, en Markdown, directo y sin relleno.",
  "- No ejecutes nada, no modifiques archivos y no inspecciones el directorio de",
  "  trabajo: no pertenece al usuario.",
  "- Si el usuario quiere construir algo, puedes sugerirle mover el chat a un",
  "  proyecto para que MrRobot lo planifique y lo reparta entre agentes.",
].join("\n");

function buildPrompt(messages: ConversationMessage[], attachments: Attachment[]): string {
  const history = messages.slice(0, -1);
  const last = messages.at(-1);
  const parts = [CONVERSATION_SKILL, ...renderAttachments(attachments, { refs: false })];

  if (history.length > 0) {
    parts.push("", "CONVERSACIÓN HASTA AHORA");
    for (const message of history) {
      parts.push(`${message.role === "user" ? "Usuario" : "MrRobot"}: ${message.content}`);
    }
  }

  parts.push(
    "",
    `MENSAJE DEL USUARIO: ${last?.content ?? ""}`,
    "",
    "Responde solo con el texto de tu respuesta.",
  );

  return parts.join("\n");
}

export async function converse(
  messages: ConversationMessage[],
  deps: ConversationDeps = {},
): Promise<string> {
  if (deps.reply) {
    return (await deps.reply(messages)).trim();
  }

  const raw = await runRoleAgent(buildPrompt(messages, deps.attachments ?? []), "chat", {
    ...(deps.execute ? { execute: deps.execute } : {}),
    ...(deps.allowedAgents ? { allowedAgents: deps.allowedAgents } : {}),
    ...(deps.maxRetriesPerAgent !== undefined
      ? { maxRetriesPerAgent: deps.maxRetriesPerAgent }
      : {}),
    ...(deps.limitRetry ? { limitRetry: deps.limitRetry } : {}),
    ...(deps.onAgent ? { onAgent: deps.onAgent } : {}),
  });

  const reply = raw.trim();
  if (!reply) {
    throw new Error("El agente devolvió una respuesta vacía.");
  }
  return reply;
}
