import type { OutgoingAttachment } from "./api";

/**
 * Primer mensaje de un chat nuevo. Como en ChatGPT, el inicio crea el chat y
 * navega en el acto; la página del chat lo envía y muestra la espera, en vez
 * de dejar al usuario mirando el inicio mientras el agente responde.
 */
export interface PendingMessage {
  content: string;
  attachments?: OutgoingAttachment[];
}

const pending = new Map<string, PendingMessage>();

export function setPendingMessage(chatId: string, message: PendingMessage): void {
  pending.set(chatId, message);
}

/** Lo entrega una sola vez: recargar la página no lo reenvía. */
export function takePendingMessage(chatId: string): PendingMessage | undefined {
  const message = pending.get(chatId);
  pending.delete(chatId);
  return message;
}
