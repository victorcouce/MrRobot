import { randomUUID } from "node:crypto";
import { describeAgent } from "../agents/selector.js";
import type { AgentEventInfo } from "../agents/types.js";
import type { ProjectEvent, Storage } from "../storage/types.js";

/**
 * Construye un `onAgentEvent` (ver `agents/types.ts`) que persiste cada
 * intento de agente como un evento del proyecto: `agent.started`,
 * `agent.completed` o `agent.failed`. `scope` distingue quién lo ejecuta
 * (`worker`, `planner`, `reviewer`, `supervisor`, `instructions`) para que el
 * fichero .log y la UI puedan agruparlos.
 *
 * No usa `emitProjectEvent` de `projects/service.ts` a propósito: ese módulo
 * importaría este, y este a aquel, si se llamara desde ahí.
 */
export function createAgentEventEmitter(
  storage: Storage,
  projectId: string,
  scope: string,
): (taskId: string | undefined, info: AgentEventInfo) => Promise<void> {
  return async (taskId, info) => {
    const type =
      info.phase === "start"
        ? "agent.started"
        : info.phase === "success"
          ? "agent.completed"
          : "agent.failed";

    const payload: Record<string, unknown> = {
      scope,
      agent: describeAgent(info.agent),
      attempt: info.attempt,
    };

    if (info.chainIndex !== undefined) payload.chainIndex = info.chainIndex + 1;
    if (info.chainLength !== undefined) payload.chainLength = info.chainLength;
    if (info.durationMs !== undefined) payload.durationMs = info.durationMs;
    if (info.error !== undefined) payload.error = info.error;
    if (info.reason !== undefined) payload.reason = info.reason;

    const event: ProjectEvent = {
      id: randomUUID(),
      projectId,
      type,
      payload,
      createdAt: new Date(),
    };

    if (taskId !== undefined) event.taskId = taskId;

    await storage.appendEvent(event);
  };
}
