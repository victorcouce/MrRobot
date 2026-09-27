"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight, Folder, FolderPlus, Search } from "lucide-react";
import { clsx } from "@/lib/cx";
import type { Chat, Project } from "@/types";

const ROW_CLASS =
  "focus-ring flex h-9 w-full items-center gap-2.5 rounded-btn px-2.5 text-[13px] transition-colors duration-100";

interface ProjectsPopupProps {
  projects: Project[];
  chatsByProject: Map<string, Chat[]>;
  activeProjectId: string | null;
  onNewProject?: () => void;
  onNavigate?: () => void;
}

export function ProjectsPopup({
  projects,
  chatsByProject,
  activeProjectId,
  onNewProject,
  onNavigate,
}: ProjectsPopupProps) {
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const hoverTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? projects.filter((project) =>
        project.name.toLowerCase().includes(needle),
      )
    : projects;

  const handleMouseEnter = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setIsOpen(true);
    }, 100);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
  };

  const handlePopupMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
  };

  const handlePopupMouseLeave = () => {
    setIsOpen(false);
  };

  const active = projects.some((p) => p.id === activeProjectId);

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        className={clsx(
          ROW_CLASS,
          "group/row justify-between",
          active ? "bg-muted text-ink" : "text-ink-2 hover:bg-muted hover:text-ink",
        )}
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2.5 flex-1">
          <Folder className="h-4 w-4" aria-hidden />
          <span>Proyectos</span>
          <span className="text-[11px] text-ink-4">{projects.length}</span>
        </div>
        <ChevronRight
          className={clsx(
            "h-4 w-4 transition-transform",
            isOpen ? "rotate-90" : "",
          )}
          aria-hidden
        />
      </button>

      {isOpen && (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-line bg-surface shadow-lg"
          onMouseEnter={handlePopupMouseEnter}
          onMouseLeave={handlePopupMouseLeave}
        >
          <div className="flex flex-col gap-1 p-2">
            <div className="flex items-center gap-2 px-2 py-1.5 mb-1 bg-muted rounded-lg">
              <Search className="h-4 w-4 text-ink-3" aria-hidden />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar…"
                className="flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-4"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                onNewProject?.();
                setIsOpen(false);
              }}
              className={clsx(ROW_CLASS, "text-ink-2 hover:bg-muted hover:text-ink")}
            >
              <FolderPlus className="h-4 w-4" aria-hidden />
              Nuevo proyecto
            </button>

            {visible.length === 0 && projects.length === 0 && (
              <div className="px-2.5 py-2 text-[12.5px] text-ink-4">
                Aún no hay proyectos
              </div>
            )}

            {projects.length > 0 && visible.length === 0 && (
              <div className="px-2.5 py-2 text-[12.5px] text-ink-4">
                Ningún proyecto coincide
              </div>
            )}

            {visible.length > 0 && (
              <div className="border-t border-line pt-1 max-h-64 overflow-y-auto">
                {visible.map((project) => {
                  const isActive = project.id === activeProjectId;
                  const chats = chatsByProject?.get(project.id) ?? [];

                  return (
                    <div key={project.id}>
                      <Link
                        href={`/projects/${project.id}`}
                        onClick={() => {
                          onNavigate?.();
                          setIsOpen(false);
                        }}
                        className={clsx(
                          ROW_CLASS,
                          "group/row justify-between",
                          isActive
                            ? "bg-primary-soft text-ink"
                            : "text-ink-2 hover:bg-muted hover:text-ink",
                        )}
                      >
                        <span className="flex-1 truncate font-medium">{project.name}</span>
                        {chats.length > 0 && (
                          <span className="text-[11px] text-ink-4">
                            {chats.length}
                          </span>
                        )}
                      </Link>

                      {isActive && chats.length > 0 && (
                        <div className="ml-4 flex flex-col gap-1 border-l border-line py-1 pl-2">
                          {chats.slice(0, 5).map((chat) => (
                            <Link
                              key={chat.id}
                              href={`/projects/${project.id}?chat=${chat.id}`}
                              onClick={() => {
                                onNavigate?.();
                                setIsOpen(false);
                              }}
                              className={clsx(
                                "focus-ring flex items-center gap-2 rounded-btn px-2 py-1 text-[12px] transition-colors duration-100",
                                pathname.includes(chat.id)
                                  ? "bg-primary-soft text-ink"
                                  : "text-ink-4 hover:bg-muted hover:text-ink-2",
                              )}
                            >
                              <span className="truncate">{chat.name}</span>
                            </Link>
                          ))}
                          {chats.length > 5 && (
                            <div className="px-2 py-1 text-[11px] text-ink-4">
                              +{chats.length - 5} más
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
