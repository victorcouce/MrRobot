"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, MessageCircle, Search, SquarePen, X } from "lucide-react";
import { useAllChats, useProjects } from "@/lib/hooks";
import { api } from "@/lib/api";
import { clsx } from "@/lib/cx";
import {
  chatHref,
  orderChats,
  projectLabel,
  RECENCY_GROUPS,
  recencyOf,
  type RecencyKey,
} from "@/lib/sidebar";
import { spaceIcon } from "@/lib/space-icons";
import type { SearchResults } from "@/lib/types";

type Item = {
  id: string;
  title: string;
  /** Proyecto del chat o fragmento que coincide. */
  detail?: ReactNode;
  icon: ReactNode;
  href?: string;
  onSelect?: () => void;
};

type Group = { title?: string; items: Item[] };

const EMPTY_RESULTS: SearchResults = { chats: [], tasks: [] };
const ICON = "h-4 w-4 shrink-0";

/** Resalta la coincidencia dentro del fragmento. */
function highlight(text: string, query: string): ReactNode {
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (!query || index === -1) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-[3px] bg-primary-soft px-0.5 text-ink">
        {text.slice(index, index + query.length)}
      </mark>
      {text.slice(index + query.length)}
    </>
  );
}

/**
 * Buscador de chats (⌘K), como el de ChatGPT: sin texto enseña «Nuevo chat» y
 * los chats recientes agrupados por fecha; al escribir busca en títulos y en
 * el contenido de los mensajes (en el servidor), además de proyectos y tareas.
 */
export function CommandPalette({
  onNewChat,
  open,
  onOpenChange,
}: {
  onNewChat?: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(0);
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [searching, setSearching] = useState(false);
  const router = useRouter();
  const { projects } = useProjects();
  const { chats } = useAllChats();
  const listRef = useRef<HTMLDivElement>(null);
  const query = search.trim();

  // Chats y tareas de todos los proyectos no caben en el cliente: se buscan en
  // el servidor (`GET /api/search`) con debounce en vez de traerse todo.
  useEffect(() => {
    if (!query) {
      setResults(EMPTY_RESULTS);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      void api
        .search(query)
        .then((data) => {
          if (!cancelled) setResults(data);
        })
        .catch(() => {
          if (!cancelled) setResults(EMPTY_RESULTS);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const projectNames = useMemo(
    () => new Map(projects.map((project) => [project.id, projectLabel(project)])),
    [projects],
  );

  const groups = useMemo<Group[]>(() => {
    const close = () => onOpenChange(false);

    if (!query) {
      const recent = new Map<RecencyKey, Item[]>();
      for (const chat of orderChats(chats).sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      )) {
        const key = recencyOf(chat.updatedAt);
        const list = recent.get(key) ?? [];
        list.push({
          id: `chat-${chat.id}`,
          title: chat.title.trim() || "Nuevo chat",
          ...(chat.projectId ? { detail: projectNames.get(chat.projectId) } : {}),
          icon: <MessageCircle className={ICON} aria-hidden />,
          href: chatHref(chat),
        });
        recent.set(key, list);
      }

      return [
        {
          items: [
            {
              id: "new-chat",
              title: "Nuevo chat",
              icon: <SquarePen className={ICON} aria-hidden />,
              onSelect: () => {
                close();
                onNewChat?.();
              },
            },
          ],
        },
        ...RECENCY_GROUPS.flatMap(({ key, title }) => {
          const items = recent.get(key);
          return items ? [{ title, items }] : [];
        }),
      ];
    }

    const needle = query.toLowerCase();
    const found: Group[] = [];

    const chatItems: Item[] = results.chats.map((chat) => ({
      id: `chat-${chat.id}`,
      title: chat.title || "Nuevo chat",
      detail: chat.snippet ? highlight(chat.snippet, query) : chat.projectName,
      icon: <MessageCircle className={ICON} aria-hidden />,
      href: chatHref(chat),
    }));
    if (chatItems.length > 0) found.push({ title: "Chats", items: chatItems });

    const projectItems: Item[] = projects
      .filter(
        (project) =>
          !project.archivedAt &&
          (projectLabel(project).toLowerCase().includes(needle) ||
            project.name.toLowerCase().includes(needle)),
      )
      .slice(0, 8)
      .map((project) => {
        const Icon = spaceIcon(project.icon);
        return {
          id: `project-${project.id}`,
          title: projectLabel(project),
          detail: project.name,
          icon: <Icon className={ICON} aria-hidden />,
          href: `/projects/${project.id}`,
        };
      });
    if (projectItems.length > 0) found.push({ title: "Proyectos", items: projectItems });

    const taskItems: Item[] = results.tasks.map((task) => ({
      id: `task-${task.id}`,
      title: task.title,
      detail: `${task.id} · ${task.projectName ?? ""}`,
      icon: <CheckSquare className={ICON} aria-hidden />,
      href: `/projects/${task.projectId}`,
    }));
    if (taskItems.length > 0) found.push({ title: "Tareas", items: taskItems });

    return found;
  }, [query, chats, results, projects, projectNames, onNewChat, onOpenChange]);

  const flat = useMemo(() => groups.flatMap((group) => group.items), [groups]);

  function activate(item: Item | undefined) {
    if (!item) return;
    if (item.onSelect) {
      item.onSelect();
      return;
    }
    if (item.href) {
      router.push(item.href);
      onOpenChange(false);
    }
  }

  // Refs para que el listener de teclado no dependa de `flat`/`selected`/
  // `open`: si no, se resuscribe en cada tecla en vez de montarse una vez.
  const openRef = useRef(open);
  openRef.current = open;
  const flatRef = useRef(flat);
  flatRef.current = flat;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const activateRef = useRef(activate);
  activateRef.current = activate;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!openRef.current);
        return;
      }

      if (!openRef.current) return;

      switch (e.key) {
        case "Escape":
          e.preventDefault();
          onOpenChange(false);
          break;
        case "ArrowDown": {
          e.preventDefault();
          const count = flatRef.current.length;
          if (count > 0) setSelected((s) => (s + 1) % count);
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const count = flatRef.current.length;
          if (count > 0) setSelected((s) => (s - 1 + count) % count);
          break;
        }
        case "Enter":
          if (e.isComposing) return;
          e.preventDefault();
          activateRef.current(flatRef.current[selectedRef.current]);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange]);

  // Cada apertura empieza de cero, como en ChatGPT.
  useEffect(() => {
    if (open) {
      setSearch("");
      setSelected(0);
    }
  }, [open]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${selected}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);

  if (!open) {
    return null;
  }

  let index = -1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/30 px-4 pt-[12vh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar chats"
        className="flex max-h-[70vh] w-full max-w-[680px] flex-col overflow-hidden rounded-[18px] border border-line bg-surface shadow-modal"
      >
        <div className="flex shrink-0 items-center gap-2.5 border-b border-line-soft px-4 py-3">
          <Search className="h-[18px] w-[18px] shrink-0 text-ink-4" aria-hidden />
          <input
            type="text"
            placeholder="Buscar chats…"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-4"
            aria-label="Buscar chats"
            aria-controls="palette-results"
            aria-activedescendant={flat[selected] ? `palette-${flat[selected].id}` : undefined}
          />
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Cerrar"
            className="focus-ring flex h-8 w-8 items-center justify-center rounded-btn text-ink-4 hover:bg-muted hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div
          ref={listRef}
          id="palette-results"
          role="listbox"
          aria-label="Resultados"
          className="min-h-0 flex-1 overflow-y-auto p-2"
        >
          {flat.length === 0 ? (
            <div className="px-4 py-10 text-center text-[13.5px] text-ink-4">
              {searching ? "Buscando…" : "No se encontraron resultados"}
            </div>
          ) : (
            groups.map((group, groupIndex) => (
              <div key={group.title ?? `group-${groupIndex}`} className="mb-1 last:mb-0">
                {group.title && (
                  <div className="px-3 pb-1 pt-3 text-[12px] font-medium text-ink-4">
                    {group.title}
                  </div>
                )}
                {group.items.map((item) => {
                  index += 1;
                  const current = index;
                  const isSelected = current === selected;
                  return (
                    <div
                      key={item.id}
                      id={`palette-${item.id}`}
                      role="option"
                      aria-selected={isSelected}
                      data-index={current}
                      onMouseMove={() => {
                        if (selected !== current) setSelected(current);
                      }}
                      onClick={() => activate(item)}
                      className={clsx(
                        "flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2.5 text-[14px] text-ink",
                        isSelected ? "bg-muted" : "hover:bg-muted/60",
                      )}
                    >
                      <span className="text-ink-3">{item.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{item.title}</span>
                        {item.detail && (
                          <span className="block truncate text-[12.5px] text-ink-4">
                            {item.detail}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-line-soft px-4 py-2 text-[12px] text-ink-4">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-line-strong bg-subtle px-1.5 py-0.5 font-mono">↑↓</kbd>
            <kbd className="rounded border border-line-strong bg-subtle px-1.5 py-0.5 font-mono">↲</kbd>
            para abrir ·
            <kbd className="rounded border border-line-strong bg-subtle px-1.5 py-0.5 font-mono">Esc</kbd>
          </span>
        </div>
      </div>
    </div>
  );
}
