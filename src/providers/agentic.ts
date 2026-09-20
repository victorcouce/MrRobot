/**
 * Adaptador agnóstico para convertir respuestas de proveedores API
 * (OpenAI-compatible, etc) al tipo ChatClient del harness.
 */

import type OpenAI from "openai";
import type { ChatClient, ChatRequest, ChatReply } from "../harness/types.js";

/**
 * Convierte una respuesta de OpenAI al formato del harness.
 */
export function openaiToHarnessReply(
  response: OpenAI.Chat.Completions.ChatCompletion,
): ChatReply {
  const message = response.choices[0]?.message;

  if (!message) {
    throw new Error("no message in response");
  }

  if (message.tool_calls && message.tool_calls.length > 0) {
    const toolCalls = message.tool_calls
      .filter((tc) => tc.type === "function")
      .map((tc) => {
        const funcCall = tc as unknown as { id: string; function: { name: string; arguments: string } };
        return {
          id: funcCall.id,
          name: funcCall.function.name,
          argumentsRaw: funcCall.function.arguments,
        };
      });

    return {
      ...(message.content ? { content: message.content } : {}),
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
    };
  }

  if (message.content) {
    return { content: message.content };
  }

  // El modelo no usó herramientas ni devolvió texto
  return {};
}

/**
 * Convierte un ChatRequest del harness al formato de OpenAI.
 */
function harnessToOpenaiRequest(
  req: ChatRequest,
): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
    req.messages.map((msg) => {
      if (msg.role === "system" || msg.role === "user") {
        return { role: msg.role, content: msg.content };
      }

      if (msg.role === "assistant") {
        const assistantMsg: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam =
          {
            role: "assistant",
            content: msg.content ?? null,
          };

        if (msg.toolCalls) {
          assistantMsg.tool_calls = msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.name,
              arguments: tc.argumentsRaw,
            },
          }));
        }

        return assistantMsg;
      }

      if (msg.role === "tool") {
        return {
          role: "tool",
          tool_call_id: msg.toolCallId,
          content: msg.content,
        };
      }

      throw new Error(`unknown role: ${(msg as { role: string }).role}`);
    });

  return {
    model: "deepseek-chat",
    messages,
    tools: req.tools?.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters as Record<string, unknown>,
      },
    })),
    temperature: req.temperature ?? 1,
  };
}

/**
 * Adaptador OpenAI → ChatClient del harness.
 */
export class OpenAIChatClient implements ChatClient {
  readonly label: string;

  constructor(
    private client: OpenAI,
    label: string,
  ) {
    this.label = label;
  }

  async complete(req: ChatRequest): Promise<ChatReply> {
    const openaiReq = harnessToOpenaiRequest(req);

    const response = await this.client.chat.completions.create(openaiReq);

    return openaiToHarnessReply(response);
  }
}
