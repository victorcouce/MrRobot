"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useProjects } from "@/lib/hooks";
import { useAllChats } from "@/lib/hooks";
import { clsx } from "@/lib/cx";

type CommandItem = {
  id: string;
  title: string;
  description?: string;
  category: "chat" | "project" | "action";
  icon?: string;
  onSelect: () => void;
};

export function CommandPalette({
  onNewProject,
}: {
  onNewProject?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(0);
  const router = useRouter();
  const { projects } = useProjects();
  const { chats } = useAllChats();

  const commands: CommandItem[] = [
    {
      id: "new-project",
      title: "Nuevo proyecto",
      description: "Crear un nuevo proyecto",
      category: "action",
      onSelect: () => {
        setOpen(false);
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
        setOpen(false);
      },
    },
    ...projects.map((p) => ({
      id: `project-${p.id}`,
      title: p.name,
      description: `Estado: ${p.status}`,
      category: "project" as const,
      onSelect: () => {
        router.push(`/projects/${p.id}`);
        setOpen(false);
      },
    })),
    ...chats.map((c) => ({
      id: `chat-${c.id}`,
      title: c.title || "Chat sin título",
      description: `Proyecto: ${projects.find((p) => p.id === c.projectId)?.name || "?"}`,
      category: "chat" as const,
      onSelect: () => {
        router.push(`/projects/${c.projectId}?chat=${c.id}`);
        setOpen(false);
      },
    })),
  ];

  const filtered = commands.filter((cmd) =>
    cmd.title.toLowerCase().includes(search.toLowerCase()) ||
    cmd.description?.toLowerCase().includes(search.toLowerCase()),
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        setSearch("");
        setSelected(0);
      }
      if (!open) return;

      switch (e.key) {
        case "Escape":
          setOpen(false);
          break;
        case "ArrowDown":
          e.preventDefault();
          setSelected((s) => (s + 1) % filtered.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelected((s) => (s - 1 + filtered.length) % filtered.length);
          break;
        case "Enter":
          e.preventDefault();
          if (filtered[selected]) {
            filtered[selected].onSelect();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, search, selected, filtered]);

  if (!open) {
    return null;
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={() => setOpen(false)}
      />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md z-50">
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
              placeholder="Busca proyectos, chats, acciones…"
              autoFocus
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelected(0);
              }}
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-ink-4"
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
                      <span className="text-xs text-ink-4">💬</span>
                    )}
                    {cmd.category === "project" && (
                      <span className="text-xs text-ink-4">📁</span>
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
