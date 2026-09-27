"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChatSummary, ProjectSummary, Space } from "./types";

/** Enlace de un chat: los de proyecto viven en su hilo; los sueltos, en /chats. */
export function chatHref(chat: Pick<ChatSummary, "id" | "projectId">): string {
  return chat.projectId
    ? `/projects/${chat.projectId}?chat=${chat.id}`
    : `/chats/${chat.id}`;
}

/**
 * Última actividad del proyecto: lo más reciente entre el propio proyecto y
 * sus chats, para que un chat nuevo lo suba en la lista.
 */
export function lastActivity(
  project: ProjectSummary,
  chats: ChatSummary[] = [],
): string {
  return chats.reduce(
    (latest, chat) => (chat.updatedAt > latest ? chat.updatedAt : latest),
    project.updatedAt,
  );
}

/** Como en ChatGPT: los fijados arriba y el resto por actividad reciente. */
function pinnedFirst<T extends { pinned?: boolean }>(
  items: T[],
  at: (item: T) => string,
): T[] {
  return [...items].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return at(b).localeCompare(at(a));
  });
}

export function orderProjects(
  projects: ProjectSummary[],
  chatsByProject: Map<string, ChatSummary[]>,
): ProjectSummary[] {
  return pinnedFirst(
    projects.filter((project) => !project.archivedAt),
    (project) => lastActivity(project, chatsByProject.get(project.id)),
  );
}

export function orderChats(chats: ChatSummary[]): ChatSummary[] {
  return pinnedFirst(
    chats.filter((chat) => !chat.archivedAt),
    (chat) => chat.updatedAt,
  );
}

/** Chats sin proyecto: la sección «Chats» de la barra lateral. */
export function looseChats(chats: ChatSummary[]): ChatSummary[] {
  return orderChats(chats.filter((chat) => !chat.projectId));
}

export function groupChatsByProject(
  chats: ChatSummary[],
): Map<string, ChatSummary[]> {
  const map = new Map<string, ChatSummary[]>();
  for (const chat of chats) {
    if (!chat.projectId) continue;
    const list = map.get(chat.projectId) ?? [];
    list.push(chat);
    map.set(chat.projectId, list);
  }
  for (const [projectId, list] of map) {
    map.set(projectId, orderChats(list));
  }
  return map;
}

export function projectInSpace(
  project: ProjectSummary,
  space: Space | null,
): boolean {
  return !space || project.repoPath === space.path;
}

export function projectLabel(
  project: Pick<ProjectSummary, "title" | "goal" | "name">,
): string {
  return project.title?.trim() || project.goal.trim() || project.name;
}

export type RecencyKey = "today" | "yesterday" | "week" | "month" | "older";

/** Grupos del buscador de chats, como en ChatGPT. */
export const RECENCY_GROUPS: { key: RecencyKey; title: string }[] = [
  { key: "today", title: "Hoy" },
  { key: "yesterday", title: "Ayer" },
  { key: "week", title: "7 días anteriores" },
  { key: "month", title: "30 días anteriores" },
  { key: "older", title: "Más antiguos" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Hoy y Ayer por día natural; el resto por antigüedad. */
export function recencyOf(iso: string, now = Date.now()): RecencyKey {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const at = new Date(iso).getTime();
  const today = startOfToday.getTime();

  if (at >= today) return "today";
  if (at >= today - DAY_MS) return "yesterday";
  if (at >= today - 7 * DAY_MS) return "week";
  if (at >= today - 30 * DAY_MS) return "month";
  return "older";
}

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

const STORAGE_EVENT = "mrrobot:storage";

/**
 * Estado que sobrevive a recargas (secciones colapsadas, espacio elegido…).
 * Arranca con el valor por defecto y lee localStorage tras montar para no
 * romper la hidratación. Las instancias con la misma clave (barra completa y
 * contraída, otras pestañas) se mantienen sincronizadas.
 */
export function usePersistentState<T>(
  key: string,
  fallback: T,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(fallback);

  useEffect(() => {
    const sync = (event: Event) => {
      if (event instanceof StorageEvent) {
        if (event.key === key) setValue(readStored(key, fallback));
        return;
      }
      const detail = (event as CustomEvent<{ key: string; value: T }>).detail;
      if (detail.key === key) setValue(detail.value);
    };
    setValue(readStored(key, fallback));
    window.addEventListener(STORAGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(STORAGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
    // `fallback` es un literal: solo importa la clave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (next: T) => {
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Sin almacenamiento el estado vive solo en memoria.
      }
      // También actualiza esta instancia.
      window.dispatchEvent(new CustomEvent(STORAGE_EVENT, { detail: { key, value: next } }));
    },
    [key],
  );

  return [value, update];
}

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
