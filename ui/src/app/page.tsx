"use client";

import Link from "next/link";
import { useState } from "react";
import { useAppInfo, useProjects } from "@/lib/hooks";
import { useNewProject } from "@/components/layout/LayoutContent";
import { PROJECT_STATUS } from "@/lib/status";
import { clsx } from "@/lib/cx";

export default function HomePage() {
  const { projects } = useProjects();
  const { info } = useAppInfo();
  const { openNewProject } = useNewProject();
  const [goal, setGoal] = useState("");

  const recent = projects.slice(0, 3);
  const connected = (info?.agents ?? []).filter((agent) => agent.connected);

  return (
    <div className="flex h-full flex-col items-center justify-center px-12 py-12">
      {info?.mock && (
        <div className="absolute top-0 left-0 right-0 bg-warning-soft px-4 py-2 text-center text-sm text-warning-text">
          🧪 Modo simulado (MRROBOT_MOCK=1): sin tokens ni cambios en Git
        </div>
      )}

      <div className="mb-10 flex flex-col items-center gap-2">
        <h1 className="font-display text-6xl font-normal tracking-tight text-ink">
          ¿Qué construimos hoy?
        </h1>
        <p className="text-base text-ink-3">
          Describe el objetivo. MrRobot lo planifica, lo reparte entre agentes y
          lo deja en una rama aparte.
        </p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          openNewProject(goal.trim());
        }}
        className="w-full max-w-[820px] rounded-composer border border-line-strong bg-surface shadow-block"
      >
        <label htmlFor="goal" className="sr-only">
          Objetivo del proyecto
        </label>
        <textarea
          id="goal"
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              openNewProject(goal.trim());
            }
          }}
          placeholder="Crea una calculadora web con historial y tests…"
          className="w-full resize-none border-0 bg-transparent p-5 font-sans text-lg leading-normal outline-none"
        />

        <div className="flex items-center justify-between gap-3 border-t border-line-soft px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-ink-4">
            {connected.length > 0 ? (
              <>
                <span className="inline-block h-2 w-2 rounded-full bg-success" />
                {connected.length}{" "}
                {connected.length === 1
                  ? "agente disponible"
                  : "agentes disponibles"}
              </>
            ) : (
              <>
                <span className="inline-block h-2 w-2 rounded-full bg-neutral-dot" />
                Sin agentes conectados
              </>
            )}
            <span className="text-line-strong">·</span>
            <span>La carpeta y el remoto se eligen al continuar</span>
          </div>
          <button
            type="submit"
            disabled={!goal.trim()}
            className="focus-ring inline-flex items-center justify-center gap-2 rounded-btn bg-primary px-4 py-2 text-sm font-medium text-surface hover:bg-primary-hover disabled:opacity-50"
          >
            Continuar
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </form>

      {recent.length > 0 && (
        <section className="mt-16 w-full max-w-[820px]">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-3">Recientes</h2>
            <Link
              href="/projects"
              className="text-sm text-primary hover:text-primary-hover"
            >
              Ver todos
            </Link>
          </div>

          <div className="divide-y divide-line-soft overflow-hidden rounded-block border border-line bg-surface">
            {recent.map((project) => {
              const progress = Math.round(project.stats.progress * 100);
              const status = PROJECT_STATUS[project.status];

              return (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="focus-ring grid grid-cols-[1fr_130px_160px_80px] items-center gap-4 px-4 py-3 hover:bg-subtle"
                >
                  <span className="truncate font-medium text-ink">
                    {project.name}
                  </span>
                  <span
                    className={clsx(
                      "inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium",
                      status.color === "blue"
                        ? "bg-primary-soft text-primary-soft-text"
                        : status.color === "emerald"
                          ? "bg-success-soft text-success-text"
                          : status.color === "red"
                            ? "bg-danger-soft text-danger-text"
                            : status.color === "amber" ||
                                status.color === "orange"
                              ? "bg-warning-soft text-warning-text"
                              : "bg-muted text-ink-2",
                    )}
                  >
                    <span
                      className={clsx(
                        "inline-block h-2 w-2 rounded-full",
                        status.pulse && "animate-pulse-dot",
                        status.color === "blue"
                          ? "bg-primary"
                          : status.color === "emerald"
                            ? "bg-success"
                            : status.color === "red"
                              ? "bg-danger"
                              : status.color === "amber" ||
                                  status.color === "orange"
                                ? "bg-warning"
                                : "bg-neutral-dot",
                      )}
                    />
                    {status.label}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-user-bubble">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs tabular-nums text-ink-4">
                      {progress}%
                    </span>
                  </div>
                  <span className="text-right text-xs text-ink-4">
                    {new Date(project.updatedAt).toLocaleDateString("es-ES", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
