import { formatDuration, formatLogLine } from "./log-format";
import type { ProjectEvent } from "./types";

/**
 * Vuelca en la consola del navegador cada evento del proyecto (tareas,
 * agentes, planner/reviewer/supervisor, git, proyecto) con su hora y, cuando
 * se conoce, la duración. Es el mismo stream que alimenta el fichero `.log`
 * del backend (ver `src/logging/file-logger.ts`): sirve para ver en vivo qué
 * está haciendo cada agente y encontrar qué tareas tardan más.
 *
 * `task.output` (la salida en vivo del agente) se excluye a propósito: es un
 * chunk de stdout por evento y saturaría la consola sin aportar al objetivo
 * de medir tiempos.
 */

const COLORS: Record<string, string> = {
  started: "#3b82f6",
  completed: "#22c55e",
  failed: "#ef4444",
};

function colorFor(type: string): string {
  for (const [suffix, color] of Object.entries(COLORS)) {
    if (type.endsWith(suffix)) return color;
  }
  return "#94a3b8";
}

// Hora de inicio de cada tarea (por `task.started`), para poder anunciar la
// duración total al verla terminar (`task.completed` / `task.failed`).
const taskStartedAt = new Map<string, number>();

// Un evento persistido (con `id`) solo se imprime una vez, aunque llegue por
// SSE y también en la recarga REST que sigue a cada evento: sin esto, abrir
// la pestaña de un proyecto que ya llevaba un rato en marcha no muestra nada
// hasta el siguiente evento (lo ya ocurrido solo estaba en el REST, no en el
// SSE que alimenta la consola).
const loggedEventIds = new Set<string>();

export function logProjectEvent(event: ProjectEvent): void {
  // "connected" es un ping interno del SSE (server.ts), no un evento del
  // dominio: no tiene id ni createdAt reales.
  if (event.type === "task.output" || event.type === "connected") return;

  if (event.id) {
    if (loggedEventIds.has(event.id)) return;
    loggedEventIds.add(event.id);
  }

  if (event.type === "task.started" && event.taskId) {
    taskStartedAt.set(event.taskId, new Date(event.createdAt).getTime());
  }

  let line = formatLogLine(event);

  if (
    event.taskId &&
    (event.type === "task.completed" || event.type === "task.failed")
  ) {
    const startedAt = taskStartedAt.get(event.taskId);
    if (startedAt !== undefined) {
      line += `  · tarea completa en ${formatDuration(new Date(event.createdAt).getTime() - startedAt)}`;
      taskStartedAt.delete(event.taskId);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`%c[MrRobot] ${line}`, `color:${colorFor(event.type)}`);
}

/**
 * Vuelca el histórico (en orden cronológico) más lo que vaya llegando por
 * SSE: se llama cada vez que se recarga el proyecto, así que si ya se
 * imprimió un evento (mismo `id`) se ignora.
 */
export function logProjectEvents(events: ProjectEvent[]): void {
  [...events]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .forEach(logProjectEvent);
}
