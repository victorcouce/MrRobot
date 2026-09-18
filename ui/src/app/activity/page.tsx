"use client";

import { useState } from "react";
import Link from "next/link";
import { useActivity, useProjects } from "@/lib/hooks";
import { describeEvent } from "@/lib/events";
import { clockTime, relativeTime } from "@/lib/format";
import { LoadingState } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { ProjectEvent } from "@/lib/types";

type EventCategory = "all" | "tasks" | "reviews" | "git" | "system";

const CATEGORY_LABELS: Record<EventCategory, string> = {
  all: "Todos",
  tasks: "Tareas",
  reviews: "Reviews",
  git: "Git",
  system: "Sistema",
};

export default function ActivityPage() {
  const { events, loading } = useActivity();
  const { projects } = useProjects();
  const [category, setCategory] = useState<EventCategory>("all");
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState<string>("all");

  const categoryFilters: Record<EventCategory, (event: ProjectEvent) => boolean> = {
    all: () => true,
    tasks: (event) => event.type.startsWith("task."),
    reviews: (event) => event.type === "task.review_passed" || event.type === "task.review_failed",
    git: (event) => event.type.startsWith("git."),
    system: (event) => event.type.startsWith("project.") || event.type.startsWith("plan."),
  };

  const filtered = events.filter((event) => {
    if (!categoryFilters[category](event)) return false;
    if (projectId !== "all" && event.projectId !== projectId) return false;
    if (search && !describeEvent(event).title.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    return true;
  });

  const projectMap = new Map(projects.map((p) => [p.id, p]));

  const getCategoryColor = (type: string) => {
    if (type.startsWith("task.")) return "bg-primary-soft text-primary-soft-text";
    if (type.startsWith("review")) return "bg-warning-soft text-warning-text";
    if (type.startsWith("git.")) return "bg-danger-soft text-danger-text";
    return "bg-muted text-ink-3";
  };

  const getCategoryLabel = (type: string) => {
    if (type.startsWith("task.")) return "Tarea";
    if (type.startsWith("review")) return "Review";
    if (type.startsWith("git.")) return "Git";
    if (type.startsWith("plan.")) return "Plan";
    if (type.startsWith("supervisor.")) return "Supervisor";
    return "Sistema";
  };

  return (
    <div className="flex h-full flex-col bg-bg">
      {/* Header */}
      <header className="border-b border-line bg-surface px-7 py-3.5 shadow-sm">
        <div>
          <h1 className="text-sm font-semibold text-ink">Actividad</h1>
          <p className="text-xs text-ink-3 mt-0.5">Eventos globales de todos los proyectos</p>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-hidden px-7 py-6">
        {/* Toolbar */}
        <div className="mb-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {(["all", "tasks", "reviews", "git", "system"] as EventCategory[]).map((cat) => (
              <Button
                key={cat}
                variant={category === cat ? "primary" : "secondary"}
                size="sm"
                onClick={() => setCategory(cat)}
              >
                {CATEGORY_LABELS[cat]}
              </Button>
            ))}
            <select
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              className="rounded-btn border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink-2 outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Filtrar por proyecto"
            >
              <option value="all">Todos los proyectos</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-ink-3">
              <circle cx="11" cy="11" r="7"></circle>
              <path d="m20 20-3.5-3.5"></path>
            </svg>
            <input
              type="text"
              placeholder="Buscar eventos…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-4"
            />
          </div>
        </div>

        {/* Events */}
        {loading ? (
          <div className="flex items-center justify-center h-96">
            <LoadingState label="Cargando actividad…" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-96 text-center">
            <div className="text-sm text-ink-3">Sin eventos</div>
            <p className="text-xs text-ink-4 mt-1">Crea y ejecuta un proyecto para ver actividad.</p>
          </div>
        ) : (
          <div className="space-y-1 max-w-3xl overflow-y-auto h-[calc(100%-160px)]">
            {filtered.map((event) => {
              const descriptor = describeEvent(event);
              const project = projectMap.get(event.projectId);
              return (
                <div
                  key={event.id}
                  className="flex items-center gap-4 rounded-xl border border-line bg-surface px-4 py-3 hover:bg-subtle transition-colors"
                >
                  <div className="font-mono text-xs tabular-nums text-ink-4 w-14 flex-shrink-0">
                    {clockTime(event.createdAt)}
                  </div>
                  <div
                    className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium flex-shrink-0 ${getCategoryColor(event.type)}`}
                  >
                    {getCategoryLabel(event.type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-ink truncate">{descriptor.title}</div>
                    {descriptor.detail && (
                      <div className="text-xs text-ink-3 truncate mt-0.5">{descriptor.detail}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {project && (
                      <Link
                        href={`/projects/${event.projectId}`}
                        className="text-xs text-ink-3 hover:text-primary transition-colors"
                      >
                        {project.name}
                      </Link>
                    )}
                    <span className="text-xs text-ink-4">{relativeTime(event.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
