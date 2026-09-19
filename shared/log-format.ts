// Formato de log compartido entre backend (fichero .log) y frontend (consola
// del navegador), para que una línea de log se vea igual en ambos sitios.

export interface LoggableEvent {
  type: string;
  taskId?: string | undefined;
  payload?: unknown;
  createdAt: Date | string;
}

/** `12ms` / `3.4s` / `2m05s`, según la magnitud. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return `${ms}ms`;
  if (ms < 1000) return `${Math.round(ms)}ms`;

  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}m${seconds.toString().padStart(2, "0")}s`;
}

function isoTime(createdAt: Date | string): string {
  return typeof createdAt === "string" ? createdAt : createdAt.toISOString();
}

/**
 * Línea de log de una sola pieza para un `ProjectEvent`: hora, tipo, tarea (si
 * aplica) y los campos más útiles del payload (agente, intento, duración,
 * error). Pensada para grep/lectura humana, no para parsear.
 */
export function formatLogLine(event: LoggableEvent): string {
  const parts: string[] = [isoTime(event.createdAt), event.type];

  if (event.taskId) parts.push(event.taskId);

  const payload =
    event.payload && typeof event.payload === "object"
      ? (event.payload as Record<string, unknown>)
      : undefined;

  if (payload) {
    if (typeof payload.scope === "string") parts.push(`[${payload.scope}]`);

    if (typeof payload.agent === "string") {
      const attempt =
        typeof payload.attempt === "number"
          ? typeof payload.chainLength === "number"
            ? ` intento ${payload.attempt} (${payload.chainIndex ?? "?"}/${payload.chainLength})`
            : ` intento ${payload.attempt}`
          : "";
      parts.push(`${payload.agent}${attempt}`);
    }

    if (typeof payload.durationMs === "number") {
      parts.push(`(${formatDuration(payload.durationMs)})`);
    }

    if (typeof payload.reason === "string") parts.push(`motivo=${payload.reason}`);
    if (typeof payload.error === "string") parts.push(`error="${payload.error}"`);
    if (typeof payload.summary === "string") parts.push(payload.summary);
    if (typeof payload.commit === "string") parts.push(`commit=${payload.commit.slice(0, 7)}`);
    if (typeof payload.branch === "string") parts.push(`branch=${payload.branch}`);
  }

  return parts.join("  ");
}
