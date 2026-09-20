/**
 * Tipos para el bucle de tool-calling agnóstico de proveedor.
 */

export interface ChatToolCall {
  id: string;
  name: string;
  /** JSON crudo sin parsear, para detectar malformaciones. */
  argumentsRaw: string;
}

export type HarnessMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content?: string; toolCalls?: ChatToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export interface ChatRequest {
  system?: string;
  messages: HarnessMessage[];
  tools: ToolDefinition[];
  temperature?: number;
}

export interface ChatReply {
  content?: string;
  toolCalls?: ChatToolCall[];
  /** El modelo rechazó el tool-calling. */
  toolCallingUnsupported?: boolean;
}

export interface ChatClient {
  readonly label: string;
  complete(req: ChatRequest): Promise<ChatReply>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface HarnessBounds {
  maxIterations: number;
  maxToolCalls: number;
  timeoutMs: number;
  maxToolOutputChars: number;
  maxHistoryChars: number;
  maxInvalidToolCalls: number;
  maxNoToolReplies: number;
  maxSandboxViolations: number;
}

export interface HarnessConfig {
  enabled: boolean;
  bounds: HarnessBounds;
}

export interface HarnessIterationResult {
  complete: boolean;
  finalOutput?: string;
  toolCalls: number;
  iterations: number;
}

/**
 * Error que sale del harness sin recuperación: presupuesto agotado, protocolo
 * roto, modelo sin tool-calling. Prefijo "[harness] ".
 */
export class HarnessError extends Error {
  constructor(message: string) {
    super(`[harness] ${message}`);
    this.name = "HarnessError";
  }
}

export class HarnessBudgetError extends HarnessError {
  constructor(message: string) {
    super(message);
    this.name = "HarnessBudgetError";
  }
}

export class HarnessProtocolError extends HarnessError {
  constructor(message: string) {
    super(message);
    this.name = "HarnessProtocolError";
  }
}

export class HarnessUnsupportedError extends HarnessError {
  constructor(message: string) {
    super(message);
    this.name = "HarnessUnsupportedError";
  }
}

export class HarnessCancelledError extends HarnessError {
  constructor() {
    super("cancelado por AbortSignal");
    this.name = "HarnessCancelledError";
  }
}
