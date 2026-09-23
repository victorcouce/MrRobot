import type { ProjectEvent } from "./types";

export type EventCategory = "tasks" | "reviews" | "git" | "system";

export interface EventDescriptor {
  category: EventCategory;
  title: string;
  detail?: string;
}

export const EVENT_CATEGORIES: Array<{ id: EventCategory | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "tasks", label: "Tasks" },
  { id: "reviews", label: "Reviews" },
  { id: "git", label: "Git" },
  { id: "system", label: "System" },
];

function taskLabel(event: ProjectEvent): string {
  return event.taskId ? ` ${event.taskId}` : "";
}

function agentLabel(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) return "Agente";
  const p = payload as { agent?: string; attempt?: number; scope?: string };
  const attempt = typeof p.attempt === "number" ? ` · intento ${p.attempt}` : "";
  return `${p.agent ?? "Agente"}${attempt}`;
}

function durationDetail(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const ms = (payload as { durationMs?: number }).durationMs;
  if (typeof ms !== "number") return undefined;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m${Math.round(s % 60)
    .toString()
    .padStart(2, "0")}s`;
}

function payloadString(payload: unknown): string | undefined {
  if (payload === undefined || payload === null) return undefined;
  if (typeof payload === "string") return payload;
  if (typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
    if (typeof obj.reason === "string") return obj.reason;
    if (typeof obj.summary === "string") return obj.summary;
    if (typeof obj.error === "string") return obj.error;
  }
  return undefined;
}

export function describeEvent(event: ProjectEvent): EventDescriptor {
  switch (event.type) {
    case "task.started":
      return { category: "tasks", title: `${event.taskId ?? "Tarea"} en curso` };
    case "task.completed":
      return {
        category: "tasks",
        title: `${event.taskId ?? "Tarea"} aprobada`,
        detail: typeof event.payload === "object"
          ? (event.payload as { commit?: string }).commit?.slice(0, 7)
          : undefined,
      };
    case "task.failed":
      return {
        category: "tasks",
        title: `${event.taskId ?? "Tarea"} fallida`,
        detail: payloadString(event.payload),
      };
    case "task.review_passed":
      return {
        category: "reviews",
        title: `${event.taskId ?? "Tarea"} · review aprobado`,
      };
    case "task.review_failed":
      return {
        category: "reviews",
        title: `${event.taskId ?? "Tarea"} · review no aprobado`,
        detail: payloadString(event.payload),
      };
    case "task.instruction":
      return {
        category: "tasks",
        title: `${event.taskId ?? "Tarea"} · instrucción`,
        detail:
          typeof event.payload === "object"
            ? (event.payload as { instructions?: string }).instructions
            : undefined,
      };
    case "task.instruction_reply":
      return {
        category: "tasks",
        title: `${event.taskId ?? "Tarea"} · respuesta`,
        detail:
          typeof event.payload === "object"
            ? (event.payload as { reply?: string }).reply
            : undefined,
      };
    case "agent.started":
      return {
        category: "tasks",
        title: `${agentLabel(event.payload)} en marcha${taskLabel(event)}`,
      };
    case "agent.completed":
      return {
        category: "tasks",
        title: `${agentLabel(event.payload)} completado${taskLabel(event)}`,
        detail: durationDetail(event.payload),
      };
    case "agent.failed":
      return {
        category: "tasks",
        title: `${agentLabel(event.payload)} falló${taskLabel(event)}`,
        detail: [durationDetail(event.payload), payloadString(event.payload)]
          .filter(Boolean)
          .join(" · "),
      };
    case "git.conflict":
      return {
        category: "git",
        title: `Conflicto de integración${taskLabel(event)}`,
        detail: payloadString(event.payload),
      };
    case "supervisor.replan":
      return {
        category: "system",
        title: "El supervisor replanificó",
        detail: payloadString(event.payload),
      };
    case "plan.started":
      return { category: "system", title: "Generando el plan" };
    case "plan.generated":
      return {
        category: "system",
        title: "Plan generado",
        detail: payloadString(event.payload),
      };
    case "plan.rejected":
      return {
        category: "system",
        title: "Plan descartado, reintentando",
        detail: payloadString(event.payload),
      };
    case "plan.updated":
      return { category: "system", title: `Plan actualizado${taskLabel(event)}` };
    case "project.created":
      return { category: "system", title: "Proyecto creado" };
    case "project.started":
      return { category: "system", title: "Ejecución iniciada" };
    case "project.paused":
      return { category: "system", title: "Ejecución en pausa" };
    case "project.resumed":
      return { category: "system", title: "Ejecución reanudada" };
    case "project.config_updated":
      return { category: "system", title: "Ajustes del proyecto actualizados" };
    case "project.completed":
      return {
        category: "system",
        title: "Proyecto completado",
        detail: typeof event.payload === "object"
          ? (event.payload as { branch?: string }).branch
          : undefined,
      };
    case "worktree.synced":
      return {
        category: "git",
        title: "Resultado volcado en el directorio del proyecto",
        detail: typeof event.payload === "object"
          ? (event.payload as { branch?: string }).branch
          : undefined,
      };
    case "worktree.sync_failed":
      return {
        category: "git",
        title: "No se pudo volcar el resultado en el directorio del proyecto",
        detail: payloadString(event.payload),
      };
    case "project.recovered":
      return {
        category: "system",
        title: "Proyecto recuperado",
        detail: payloadString(event.payload),
      };
    case "project.error":
      return {
        category: "system",
        title: "Error",
        detail: payloadString(event.payload),
      };
    default:
      return { category: "system", title: event.type };
  }
}
