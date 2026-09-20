/**
 * Cliente de chat simulado para tests del harness.
 */

import type { ChatClient, ChatRequest, ChatReply, ChatToolCall } from "./types.js";

export type ChatScript = Array<
  | { role: "text"; content: string }
  | { role: "tool"; toolCalls: Omit<ChatToolCall, "id">[] }
>;

/**
 * Cliente que reproduce una secuencia predefinida de respuestas.
 */
export class ScriptedChatClient implements ChatClient {
  readonly label = "test/scripted";
  private callIndex = 0;

  constructor(private script: ChatScript) {}

  async complete(req: ChatRequest): Promise<ChatReply> {
    if (this.callIndex >= this.script.length) {
      throw new Error(
        `script agotado en llamada ${this.callIndex + 1} (script tiene ${this.script.length})`,
      );
    }

    const entry = this.script[this.callIndex++];

    if (!entry) {
      throw new Error("entry is undefined");
    }

    if (entry.role === "text") {
      return { content: entry.content };
    }

    if (entry.role === "tool") {
      return {
        toolCalls: entry.toolCalls.map((tc, i) => ({
          ...tc,
          id: `${this.callIndex}-${i}`,
          argumentsRaw: JSON.stringify(tc.argumentsRaw || {}),
        })),
      };
    }

    throw new Error(`unknown role: ${(entry as { role: string }).role}`);
  }
}
