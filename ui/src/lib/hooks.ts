"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { subscribeProjectsChanged } from "./project-store";
import { subscribeProject } from "./sse";
import type {
  AppInfo,
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

  return { projects, error, loading, refresh };
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
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useProject(id: string): ProjectState {
  const [project, setProject] = useState<Project | null>(null);
  const [events, setEvents] = useState<ProjectEvent[]>([]);
  const [reviews, setReviews] = useState<StoredReview[]>([]);
  const [supervisorRuns, setSupervisorRuns] = useState<SupervisorRun[]>([]);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const [project, events, reviews, supervisorRuns, chats] =
        await Promise.all([
          api.getProject(id),
          api.getEvents(id),
          api.getReviews(id),
          api.getSupervisorRuns(id),
          api.listChats(id),
        ]);
      setProject(project);
      setEvents(events);
      setReviews(reviews);
      setSupervisorRuns(supervisorRuns);
      setChats(chats);
      setError(null);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    void load();

    const unsubscribe = subscribeProject(id, () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void load();
      }, 60);
    });

    return () => {
      clearTimeout(timer.current);
      unsubscribe();
    };
  }, [id, load]);

  return {
    project,
    events,
    reviews,
    supervisorRuns,
    chats,
    loading,
    error,
    refresh: load,
  };
}
