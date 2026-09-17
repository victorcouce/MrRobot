"use client";

import Link from "next/link";
import { useState } from "react";
import { useProjects } from "@/lib/hooks";
import { clsx } from "@/lib/cx";

const statusLabels: Record<string, string> = {
  draft: "Borrador",
  ready: "Listo",
  running: "Ejecutando",
  completed: "Completado",
  failed: "Fallido",
  cancelled: "Cancelado",
};

const statusColors: Record<string, string> = {
  draft: "bg-muted text-ink-2",
  ready: "bg-primary-soft text-primary-soft-text",
  running: "bg-primary-soft text-primary-soft-text",
  completed: "bg-success-soft text-success-text",
  failed: "bg-danger-soft text-danger-text",
  cancelled: "bg-warning-soft text-warning-text",
};

export default function ProjectsPage() {
  const { projects, error, loading } = useProjects();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const filtered = projects.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (statusFilter && p.status !== statusFilter) {
      return false;
    }
    return true;
  });

  const statuses = Array.from(new Set(projects.map((p) => p.status)));

  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="border-b border-line bg-surface px-6 py-4">
        <div className="mx-auto max-w-7xl">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-ink">
                Proyectos
              </h1>
              <p className="mt-0.5 text-sm text-ink-3">
                Planifica y ejecuta proyectos multiagente.
              </p>
            </div>
            <Link href="/">
              <button className="inline-flex items-center justify-center gap-2 rounded-btn bg-primary px-4 py-2 text-sm font-medium text-surface hover:bg-primary-hover">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
                Nuevo proyecto
              </button>
            </Link>
          </div>

          <div className="flex gap-3">
            <div className="flex-1 relative">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4"
                aria-hidden
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                type="text"
                placeholder="Buscar proyectos…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-btn border border-line-strong bg-subtle px-3 py-2 pl-9 text-sm outline-none placeholder:text-ink-4 focus:border-primary focus:ring-1 focus:ring-primary-soft"
              />
            </div>

            <select
              value={statusFilter || ""}
              onChange={(e) => setStatusFilter(e.target.value || null)}
              className="rounded-btn border border-line-strong bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary-soft"
            >
              <option value="">Todos los estados</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {statusLabels[status]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl px-6 py-6">
          {error && (
            <div className="mb-4 rounded-block border border-danger bg-danger-soft px-4 py-3 text-sm text-danger-text">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="flex flex-col items-center gap-2">
                <div className="animate-spin rounded-full border-2 border-primary-soft border-t-primary h-8 w-8" />
                <p className="text-sm text-ink-3">Cargando proyectos…</p>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex justify-center py-12">
              <div className="flex flex-col items-center gap-2">
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="text-ink-4"
                  aria-hidden
                >
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
                <p className="text-sm font-medium text-ink-2">
                  {search || statusFilter ? "No hay proyectos" : "Sin proyectos"}
                </p>
                <p className="text-xs text-ink-3">
                  {search || statusFilter
                    ? "Prueba con otros filtros"
                    : "Crea uno nuevo para empezar"}
                </p>
                {!search && !statusFilter && (
                  <Link href="/">
                    <button className="mt-2 inline-flex items-center justify-center gap-2 rounded-btn bg-primary px-3 py-1.5 text-sm font-medium text-surface hover:bg-primary-hover">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden
                      >
                        <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                      </svg>
                      Crear proyecto
                    </button>
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-block border border-line bg-surface overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line-soft bg-subtle">
                    <th className="px-4 py-3 text-left font-medium text-ink-2">
                      Nombre
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-ink-2">
                      Estado
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-ink-2">
                      Progreso
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-ink-2">
                      Actualizado
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-ink-2">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((project) => {
                    const progress = project.stats.progress * 100;
                    const updated = new Date(project.updatedAt).toLocaleDateString(
                      "es-ES",
                      {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      },
                    );

                    return (
                      <tr
                        key={project.id}
                        className="border-b border-line-soft hover:bg-subtle transition-colors"
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/projects/${project.id}`}
                            className="font-medium text-primary hover:text-primary-hover"
                          >
                            {project.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={clsx(
                              "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium",
                              statusColors[project.status],
                            )}
                          >
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-current" />
                            {statusLabels[project.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 rounded-full bg-user-bubble overflow-hidden">
                              <div
                                className="h-full bg-primary transition-all"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <span className="font-mono text-xs text-ink-4 tabular-nums w-8">
                              {Math.round(progress)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-ink-4">{updated}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            className="inline-flex items-center justify-center rounded-btn p-1.5 text-ink-4 hover:bg-muted hover:text-ink-2"
                            aria-label="Más opciones"
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              aria-hidden
                            >
                              <circle cx="12" cy="5" r="2" />
                              <circle cx="12" cy="12" r="2" />
                              <circle cx="12" cy="19" r="2" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
