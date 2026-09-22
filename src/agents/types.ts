import type { DeepSeekModel } from "../providers/deepseek.js";
import type { TokenUsage } from "./usage.js";

export type ClaudeModel = "sonnet" | "opus" | "haiku";

export type AgentSpec =
  | { provider: "codex" }
  | { provider: "claude"; model?: ClaudeModel }
  | { provider: "deepseek"; model?: DeepSeekModel };

export type AgentProvider = AgentSpec["provider"];

export type AgentCandidate = AgentSpec;

/**
 * Notifica el ciclo de vida de un intento de agente (inicio, éxito o fallo),
 * con la duración cuando termina. Lo usan `runTask` (tareas) y `runRoleAgent`
 * (planner/reviewer/supervisor/grill/instrucciones) para que el llamador
 * pueda registrar el intento (fichero .log, SSE) sin acoplar esos módulos a
 * storage.
 */
export interface AgentEventInfo {
  phase: "start" | "success" | "failed";
  agent: AgentCandidate;
  /** Número de intento dentro del mismo agente (reintentos), 1-based. */
  attempt: number;
  /** Posición del agente en la cadena de fallback, 0-based. */
  chainIndex?: number;
  chainLength?: number;
  /** Solo en "success"/"failed": milisegundos que tardó el intento. */
  durationMs?: number;
  /** Solo en "failed". */
  error?: string;
  /** Solo en "failed" por indisponibilidad (cuota, rate limit, auth, CLI ausente). */
  reason?: string;
  /** Tokens del intento, si el proveedor los reporta (ver `agents/usage.ts`). */
  usage?: TokenUsage;
}

export type OnAgentEvent = (info: AgentEventInfo) => void | Promise<void>;

export type AttachmentType = "image" | "markdown";

export interface Attachment {
  id: string;
  name: string;
  type: AttachmentType;
  mimeType: string;
  size: number;
  data?: string;
  createdAt: Date;
}
