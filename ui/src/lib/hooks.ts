"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import {
  notifyProjectsChanged,
  subscribeProjectsChanged,
} from "./project-store";
import { subscribeProject } from "./sse";
import type {
  AgentMatrixRow,
  AppInfo,
  ChatMessage,
  ChatSummary,
  Project,
  ProjectEvent,
  ProjectSummary,
  StoredReview,
  SupervisorRun,
} from "./types";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

  const refresh = useCallback(async () => {
    try {
      setProjects(await api.listProjects());
      setError(null);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

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

  const refresh = useCallback(async () => {
    try {
      setChats(await api.listAllChats());
      setError(null);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

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
