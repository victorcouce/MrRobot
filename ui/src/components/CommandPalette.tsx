"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useProjects } from "@/lib/hooks";
import { api } from "@/lib/api";
import { clsx } from "@/lib/cx";
import type { SearchResults } from "@/lib/types";

type CommandItem = {
  id: string;
  title: string;
  description?: string;
  category: "chat" | "project" | "task" | "action";
  onSelect: () => void;
};

const EMPTY_RESULTS: SearchResults = { chats: [], tasks: [] };

export function CommandPalette({
  onNewProject,
  open,
  onOpenChange,
}: {
  onNewProject?: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(0);
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const router = useRouter();
  const { projects } = useProjects();

  // Chats y tareas de todos los proyectos no caben en el cliente: se buscan en
  // el servidor (`GET /api/search`) con debounce en vez de traerse todo.
  useEffect(() => {
    const trimmed = search.trim();
    if (!trimmed) {
      setResults(EMPTY_RESULTS);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void api
        .search(trimmed)
        .then((data) => {
          if (!cancelled) setResults(data);
        })
        .catch(() => {
          if (!cancelled) setResults(EMPTY_RESULTS);
        });
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search]);

  const commands = useMemo<CommandItem[]>(() => {
    const searchLower = search.toLowerCase();

    const base: CommandItem[] = [
      {
        id: "new-project",
        title: "Nuevo proyecto",
        description: "Crear un nuevo proyecto",
        category: "action",
        onSelect: () => {
          onOpenChange(false);
          onNewProject?.();
        },
      },
      {
        id: "projects",
        title: "Ver proyectos",
        description: "Lista de todos los proyectos",
        category: "action",
        onSelect: () => {
          router.push("/projects");
          onOpenChange(false);
        },
      },
    ];

    const matchingProjects = projects
      .filter(
        (p) =>
          p.name.toLowerCase().includes(searchLower) ||
          p.status.toLowerCase().includes(searchLower),
      )
      .map((p) => ({
        id: `project-${p.id}`,
        title: p.name,
        description: `Estado: ${p.status}`,
        category: "project" as const,
        onSelect: () => {
          router.push(`/projects/${p.id}`);
          onOpenChange(false);
        },
      }));

    const matchingChats = results.chats.map((c) => ({
      id: `chat-${c.id}`,
      title: c.title || "Chat sin título",
      description: `Proyecto: ${c.projectName}`,
      category: "chat" as const,
      onSelect: () => {
        router.push(`/projects/${c.projectId}?chat=${c.id}`);
        onOpenChange(false);
      },
    }));

    const matchingTasks = results.tasks.map((t) => ({
      id: `task-${t.id}`,
      title: t.title,
      description: `Tarea ${t.id} · ${t.projectName}`,
      category: "task" as const,
      onSelect: () => {
        router.push(`/projects/${t.projectId}`);
        onOpenChange(false);
      },
    }));

    return [...base, ...matchingProjects, ...matchingChats, ...matchingTasks];
  }, [projects, results, search, onNewProject, onOpenChange, router]);

  const filtered = useMemo(() => {
    if (!search.trim()) {
      // Chats y tareas solo aparecen al buscar (piden query al servidor); las
      // acciones y los proyectos, ya cargados en el cliente, se listan siempre.
      return commands.filter(
        (cmd) => cmd.category === "action" || cmd.category === "project",
      );
    }

    const searchLower = search.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.category === "chat" ||
        cmd.category === "task" ||
        cmd.title.toLowerCase().includes(searchLower) ||
        cmd.description?.toLowerCase().includes(searchLower),
    );
  }, [commands, search]);

  // Refs para que el listener de teclado no dependa de `filtered`/`selected`/
  // `open`: si no, se resuscribe en cada tecla en vez de montarse una vez.
  const openRef = useRef(open);
  openRef.current = open;
  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(!openRef.current);
        setSearch("");
        setSelected(0);
        return;
      }

      if (!openRef.current) return;

      switch (e.key) {
        case "Escape":
          onOpenChange(false);
          break;
        case "ArrowDown": {
          e.preventDefault();
          const count = filteredRef.current.length;
          if (count > 0) setSelected((s) => (s + 1) % count);
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const count = filteredRef.current.length;
          if (count > 0) setSelected((s) => (s - 1 + count) % count);
          break;
        }
        case "Enter":
          e.preventDefault();
          filteredRef.current[selectedRef.current]?.onSelect();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange]);

  useEffect(() => {
    setSelected(0);
  }, [search]);

  if (!open) {
    return null;
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar"
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md z-50"
      >
        <div className="rounded-composer bg-surface shadow-modal overflow-hidden">
          <div className="border-b border-line-soft px-4 py-3 flex items-center gap-2">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="text-ink-4"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="text"
              placeholder="Busca proyectos, chats, tareas, acciones…"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-ink-4"
              aria-label="Buscar"
            />
          </div>

          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-ink-4">
              No se encontraron resultados
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {filtered.map((cmd, i) => (
                <button
                  key={cmd.id}
                  onClick={() => cmd.onSelect()}
                  className={clsx(
                    "w-full px-4 py-2.5 text-left text-sm border-b border-line-soft last:border-0 transition-colors",
                    i === selected
                      ? "bg-primary-soft text-primary"
                      : "hover:bg-subtle",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex-1">
                      <span className="font-medium">{cmd.title}</span>
                      {cmd.description && (
                        <div className="text-xs text-ink-4">{cmd.description}</div>
                      )}
                    </span>
                    {cmd.category === "chat" && (
                      <span className="text-xs text-ink-4" aria-hidden>
                        💬
                      </span>
                    )}
                    {cmd.category === "project" && (
                      <span className="text-xs text-ink-4" aria-hidden>
                        📁
                      </span>
                    )}
                    {cmd.category === "task" && (
                      <span className="text-xs text-ink-4" aria-hidden>
                        ☑
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="border-t border-line-soft px-4 py-2 flex items-center justify-between text-xs text-ink-4">
            <div className="flex gap-1">
              <kbd className="rounded border border-line-strong bg-subtle px-1.5 py-0.5 font-mono">
                ↑↓
              </kbd>
              <kbd className="rounded border border-line-strong bg-subtle px-1.5 py-0.5 font-mono">
                ↲
              </kbd>
              para seleccionar
            </div>
            <kbd className="rounded border border-line-strong bg-subtle px-1.5 py-0.5 font-mono">
              Esc
            </kbd>
          </div>
        </div>
      </div>
    </>
  );
}
