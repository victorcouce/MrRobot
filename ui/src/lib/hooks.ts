"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import {
  notifyProjectsChanged,
  subscribeProjectsChanged,
} from "./project-store";
import { logProjectEvent, logProjectEvents } from "./monitor-log";
import { subscribeProject } from "./sse";
import type {
  AgentMatrixRow,
  AppInfo,
  ChatDetail,
  ChatMessage,
  ChatSummary,
  MetricsSummary,
  Project,
  ProjectEvent,
  ProjectSummary,
  Space,
  StoredReview,
  SupervisorRun,
} from "./types";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Los refrescos se solapan (carga inicial, pub/sub, foco de ventana…). Este
 * guardia descarta la respuesta de una petición si ya salió otra más reciente:
 * una respuesta lenta y antigua no debe pisar el estado actual (p. ej.
 * re-añadir a la lista un proyecto que se acaba de borrar).
 */
function useLatestRequestGuard() {
  const latest = useRef(0);

  const begin = useCallback(() => {
    latest.current += 1;
    return latest.current;
  }, []);

  const isCurrent = useCallback(
    (version: number) => latest.current === version,
    [],
  );

  return { begin, isCurrent };
}

export function useAppInfo() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setInfo(await api.info());
      setError(null);
    } catch (error) {
      setError(errorMessage(error));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { info, error, refresh };
}

export function useProjects() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { begin, isCurrent } = useLatestRequestGuard();

  const refresh = useCallback(async () => {
    const version = begin();
    try {
      const next = await api.listProjects();
      if (!isCurrent(version)) return;
      setProjects(next);
      setError(null);
    } catch (error) {
      if (!isCurrent(version)) return;
      setError(errorMessage(error));
    } finally {
      if (isCurrent(version)) setLoading(false);
    }
  }, [begin, isCurrent]);

  useEffect(() => {
    void refresh();
    return subscribeProjectsChanged(() => {
      void refresh();
    });
  }, [refresh]);

  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh]);

  return { projects, error, loading, refresh };
}

export function useAllChats() {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { begin, isCurrent } = useLatestRequestGuard();

  const refresh = useCallback(async () => {
    const version = begin();
    try {
      const next = await api.listAllChats();
      if (!isCurrent(version)) return;
      setChats(next);
      setError(null);
    } catch (error) {
      if (!isCurrent(version)) return;
      setError(errorMessage(error));
    } finally {
      if (isCurrent(version)) setLoading(false);
    }
  }, [begin, isCurrent]);

  useEffect(() => {
    void refresh();
    return subscribeProjectsChanged(() => {
      void refresh();
    });
  }, [refresh]);

  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh]);

  return { chats, error, loading, refresh };
}

/** Un chat por id (suelto o de proyecto). Se refresca con la barra lateral. */
export function useChat(id: string) {
  const [chat, setChat] = useState<ChatDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const { begin, isCurrent } = useLatestRequestGuard();

  const refresh = useCallback(async () => {
    const version = begin();
    try {
      const next = await api.getChatById(id);
      if (!isCurrent(version)) return;
      setChat(next);
      setError(null);
      setNotFound(false);
    } catch (error) {
      if (!isCurrent(version)) return;
      if (error instanceof ApiError && error.status === 404) setNotFound(true);
      setError(errorMessage(error));
    } finally {
      if (isCurrent(version)) setLoading(false);
    }
  }, [id, begin, isCurrent]);

  useEffect(() => {
    setLoading(true);
    void refresh();
    return subscribeProjectsChanged(() => {
      void refresh();
    });
  }, [refresh]);

  return { chat, setChat, error, notFound, loading, refresh };
}

export function useSpaces() {
  const [spaces, setSpaces] = useState<Space[]>([]);

  const refresh = useCallback(async () => {
    try {
      setSpaces(await api.listSpaces());
    } catch {
      // Sin espacios la barra lateral muestra todos los proyectos.
    }
  }, []);

  useEffect(() => {
    void refresh();
    return subscribeProjectsChanged(() => {
      void refresh();
    });
  }, [refresh]);

  return { spaces, refresh };
}

export function useAgentMatrix() {
  const [matrix, setMatrix] = useState<AgentMatrixRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setMatrix(await api.agentMatrix());
      setError(null);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { matrix, error, loading, refresh };
}

export function useActivity(intervalMs = 5000) {
  const [events, setEvents] = useState<ProjectEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setEvents(await api.activity(100));
      setError(null);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), intervalMs);
    return () => clearInterval(interval);
  }, [refresh, intervalMs]);

  return { events, error, loading, refresh };
}

export function useMetrics(intervalMs = 15000) {
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);

  const refresh = useCallback(async () => {
    try {
      setMetrics(await api.metrics());
    } catch {
      // El panel de métricas es informativo: si falla, se mantiene lo último.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), intervalMs);
    return () => clearInterval(interval);
  }, [refresh, intervalMs]);

  return { metrics, refresh };
}

export interface ProjectState {
  project: Project | null;
  events: ProjectEvent[];
  reviews: StoredReview[];
  supervisorRuns: SupervisorRun[];
  chats: ChatSummary[];
  messages: ChatMessage[];
  /** Salida de agente en vivo por tarea (eventos efímeros `task.output`). */
  liveOutput: Record<string, string>;
  loading: boolean;
  error: string | null;
  notFound: boolean;
  refresh: () => Promise<void>;
}

/**
 * `chatId` es el chat abierto en el hilo: sus mensajes se cargan y se refrescan
 * con el mismo ciclo que el resto del proyecto, sin abrir un segundo SSE.
 */
export function useProject(id: string, chatId?: string | null): ProjectState {
  const [project, setProject] = useState<Project | null>(null);
  const [events, setEvents] = useState<ProjectEvent[]>([]);
  const [reviews, setReviews] = useState<StoredReview[]>([]);
  const [supervisorRuns, setSupervisorRuns] = useState<SupervisorRun[]>([]);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [liveOutput, setLiveOutput] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const [project, events, reviews, supervisorRuns, chats, detail] =
        await Promise.all([
          api.getProject(id),
          api.getEvents(id),
          api.getReviews(id),
          api.getSupervisorRuns(id),
          api.listChats(id),
          chatId ? api.getChat(id, chatId) : Promise.resolve(null),
        ]);
      setProject(project);
      setEvents(events);
      logProjectEvents(events);
      setReviews(reviews);
      setSupervisorRuns(supervisorRuns);
      setChats(chats);
      setMessages(detail?.messages ?? []);
      setError(null);
      setNotFound(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setNotFound(true);
        notifyProjectsChanged();
      }
      setError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [id, chatId]);

  // La suscripción solo depende del proyecto: cambiar de chat recarga los datos
  // pero no reabre el stream.
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const unsubscribe = subscribeProject(id, (event) => {
      logProjectEvent(event as unknown as ProjectEvent);

      // La salida en vivo llega en eventos efímeros: se acumula sin recargar
      // el proyecto (recargar por chunk saturaría la UI).
      if (event.type === "task.output") {
        const taskId = event.taskId;
        const chunk = (event.payload as { chunk?: string } | undefined)?.chunk;

        if (typeof taskId === "string" && typeof chunk === "string") {
          setLiveOutput((previous) => ({
            ...previous,
            [taskId]: (previous[taskId] ?? "") + chunk,
          }));
        }

        return;
      }

      if (event.type === "task.started" && typeof event.taskId === "string") {
        const taskId = event.taskId;
        setLiveOutput((previous) => ({ ...previous, [taskId]: "" }));
      }

      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void loadRef.current();
      }, 60);
    });

    return () => {
      clearTimeout(timer.current);
      unsubscribe();
    };
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    project,
    events,
    reviews,
    supervisorRuns,
    chats,
    messages,
    liveOutput,
    loading,
    error,
    notFound,
    refresh: load,
  };
}
