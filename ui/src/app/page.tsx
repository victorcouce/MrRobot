"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useProjects } from "@/lib/hooks";

export default function HomePage() {
  const { projects } = useProjects();
  const [goal, setGoal] = useState("");
  const [isMockMode, setIsMockMode] = useState(false);

  useEffect(() => {
    setIsMockMode(process.env.NEXT_PUBLIC_MOCK_MODE === "1");
  }, []);

  const recent = projects.slice(0, 3);

  return (
    <div className="flex h-full flex-col items-center justify-center px-12 py-12">
      {isMockMode && (
        <div className="absolute top-0 left-0 right-0 bg-warning-soft px-4 py-2 text-center text-sm text-warning-text">
          🧪 Modo simulado (MRROBOT_MOCK=1): sin tokens ni cambios en Git
        </div>
      )}

      <div className="flex flex-col items-center gap-2 mb-10">
        <h1 className="font-display text-6xl font-normal tracking-tight text-ink">
          ¿Qué construimos hoy?
        </h1>
        <p className="text-base text-ink-3">
          Describe el objetivo. MrRobot lo planifica, lo reparte entre agentes
          y lo deja en una rama aparte.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          // TODO: Crear proyecto y chat
        }}
        className="w-full max-w-[820px] rounded-composer border border-line-strong bg-surface shadow-block"
      >
        <label htmlFor="goal" className="sr-only">
          Objetivo del proyecto
        </label>
        <textarea
          id="goal"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Crea una calculadora web con historial y tests…"
          className="w-full border-0 bg-transparent p-5 text-lg leading-normal outline-none resize-none font-sans"
        />

        <div className="flex items-center justify-between gap-3 border-t border-line-soft px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-chip border border-line-strong bg-surface px-2.5 py-1.5 text-sm text-ink-2 hover:bg-muted"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden
              >
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              </svg>
              <span className="font-mono text-xs">~/proyectos/calc</span>
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-chip border border-line-strong bg-surface px-2.5 py-1.5 text-sm text-ink-2 hover:bg-muted"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden
              >
                <circle cx="6" cy="5" r="2" />
                <circle cx="6" cy="19" r="2" />
                <circle cx="18" cy="6" r="2" />
                <path d="M6 7v10M18 8c0 5-5 5-10 9" />
              </svg>
              Remoto GitHub
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-chip border border-line-strong bg-surface px-2.5 py-1.5 text-sm text-ink-2 hover:bg-muted"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden
              >
                <rect x="6" y="6" width="12" height="12" rx="2" />
                <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
              </svg>
              Agentes
            </button>
          </div>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-btn bg-primary px-4 py-2 text-sm font-medium text-surface hover:bg-primary-hover"
          >
            Planificar
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </form>

      {recent.length > 0 && (
        <section className="mt-16 w-full max-w-[820px]">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-3">Recientes</h2>
            <Link href="/projects" className="text-sm text-primary hover:text-primary-hover">
              Ver todos
            </Link>
          </div>

          <div className="divide-y divide-line-soft rounded-block border border-line bg-surface overflow-hidden">
            {recent.map((project) => {
              const progress = project.stats.progress * 100;
              const status = project.status;
              const statusBgClass =
                status === "running"
                  ? "bg-primary-soft"
                  : status === "completed"
                    ? "bg-success-soft"
                    : "bg-muted";
              const statusTextClass =
                status === "running"
                  ? "text-primary-soft-text"
                  : status === "completed"
                    ? "text-success-text"
                    : "text-ink-2";
              const statusDotClass =
                status === "running"
                  ? "bg-primary"
                  : status === "completed"
                    ? "bg-success"
                    : "bg-neutral-dot";
              const statusLabel =
                status === "running"
                  ? "Ejecutando"
                  : status === "completed"
                    ? "Completado"
                    : "Borrador";

              return (
                <div
                  key={project.id}
                  className="grid grid-cols-[1fr_120px_160px_90px] items-center gap-4 px-4 py-3"
                >
                  <span className="font-medium truncate">{project.name}</span>
                  <div className={`${statusBgClass} ${statusTextClass} inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium w-fit`}>
                    <span
                      className={`inline-block w-2 h-2 rounded-full animate-pulse-dot ${statusDotClass}`}
                    />
                    {statusLabel}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-user-bubble rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs text-ink-4 tabular-nums">
                      {Math.round(progress)}/100
                    </span>
                  </div>
                  <span className="text-xs text-ink-4 text-right">
                    {new Date(project.updatedAt).toLocaleDateString("es-ES", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function clsx(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
