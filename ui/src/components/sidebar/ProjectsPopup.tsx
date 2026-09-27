"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Folder, Search } from "lucide-react";
import { clsx } from "@/lib/cx";
import { spaceIcon } from "@/lib/space-icons";
import type { Project } from "@/lib/types";

interface ProjectsPopupProps {
  projects: Project[];
}

export function ProjectsPopup({ projects }: ProjectsPopupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!isOpen) return;

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

  useEffect(() => {
    if (!isOpen) setQuery("");
  }, [isOpen]);

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? projects.filter(
        (project) =>
          project.name.toLowerCase().includes(needle),
      )
    : projects;

  const handleMouseEnter = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setIsOpen(true);
    }, 200);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    // No cerrar inmediatamente, dejar que el click outside lo haga
  };

  const handlePopupMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
  };

  const handlePopupMouseLeave = () => {
    setIsOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label="Mostrar todos los proyectos"
        className="focus-ring relative flex h-10 w-10 items-center justify-center rounded-btn transition-colors duration-100 text-ink-3 hover:bg-muted hover:text-ink"
      >
        <Folder className="h-[18px] w-[18px]" aria-hidden />
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Proyectos"
          className="absolute left-14 top-0 z-50 w-[300px] rounded-[14px] border border-line-strong bg-surface p-2 shadow-modal"
          onMouseEnter={handlePopupMouseEnter}
          onMouseLeave={handlePopupMouseLeave}
        >
          <div className="flex items-center gap-2 px-2 py-2 mb-2 bg-muted rounded-lg">
            <Search className="h-4 w-4 text-ink-3" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar proyectos…"
              aria-label="Buscar proyectos"
              className="flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-4"
            />
          </div>

          <ul className="max-h-[280px] overflow-y-auto">
            {visible.map((project) => {
              const Icon = spaceIcon(project.icon);
              return (
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.id}`}
                    onClick={() => setIsOpen(false)}
                    className="focus-ring flex h-[38px] w-full items-center gap-2.5 rounded-lg px-2 text-left text-[13px] text-ink hover:bg-muted transition-colors"
                  >
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden />
                    <span className="truncate">{project.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>

          {projects.length > 0 && visible.length === 0 && (
            <p className="px-2 py-2 text-[12.5px] text-ink-4">Ningún proyecto coincide.</p>
          )}

          {projects.length === 0 && (
            <p className="px-2 py-2 text-[12.5px] text-ink-4">No hay proyectos.</p>
          )}
        </div>
      )}
    </div>
  );
}
