"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { AppInfo } from "@/lib/types";
import { clsx } from "@/lib/cx";

type ModalState = "idle" | "error" | "creating";

export function NewProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [goal, setGoal] = useState("");
  const [name, setName] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [planOnCreate, setPlanOnCreate] = useState(true);
  const [selectedAgents, setSelectedAgents] = useState<string[]>(["codex", "claude-sonnet"]);
  const [showMore, setShowMore] = useState(false);
  const [state, setState] = useState<ModalState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [pickingFolder, setPickingFolder] = useState(false);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    const loadAppInfo = async () => {
      try {
        const info = await api.info();
        setAppInfo(info);
      } catch (err) {
        console.error("Error loading app info:", err);
      }
    };

    if (open) {
      loadAppInfo();
    }
  }, [open]);

  const defaultAgents = [
    { id: "codex", label: "codex", provider: "codex" as const },
    { id: "claude-sonnet", label: "claude / sonnet", provider: "claude" as const },
    { id: "claude-opus", label: "claude / opus", provider: "claude" as const },
    { id: "deepseek-flash", label: "deepseek-flash", provider: "deepseek" as const },
  ];

  const agents = defaultAgents.map((agent) => ({
    ...agent,
    available:
      appInfo?.agents?.some((a) => a.provider === agent.provider && a.connected) ?? false,
  }));

  const autoName =
    goal
      .split(" ")
      .slice(0, 2)
      .join("-")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "") || "";

  const handlePickFolder = async () => {
    setPickingFolder(true);
    try {
      const result = await api.pickFolder();
      if (result.path) {
        setRepoPath(result.path);
      }
    } catch (err) {
      console.error("Error picking folder:", err);
    } finally {
      setPickingFolder(false);
    }
  };

  const handleCreate = async () => {
    if (!goal.trim()) {
      setError("El objetivo es requerido");
      setState("error");
      return;
    }

    setState("creating");
    setError(null);

    try {
      const project = await api.createProject({
        goal: goal.trim(),
        name: name || autoName || "Sin título",
        repoPath: repoPath || undefined,
        remoteUrl: remoteUrl || undefined,
      });

      setCreatedProjectId(project.id);

      // TODO: Plan generation when backend support is added
      // if (planOnCreate) {
      //   await api.planProject(project.id);
      // }

      // Pequeño delay antes de navegar
      setTimeout(() => {
        router.push(`/projects/${project.id}`);
        onClose();
      }, 500);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al crear el proyecto";
      setError(message);
      setState("error");
    }
  };

  const handleClose = () => {
    if (state !== "creating") {
      setGoal("");
      setName("");
      setRepoPath("");
      setRemoteUrl("");
      setPlanOnCreate(true);
      setShowMore(false);
      setState("idle");
      setError(null);
      setCreatedProjectId(null);
      onClose();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open && state !== "creating") {
        handleClose();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "n" && !open) {
        e.preventDefault();
        // TODO: Emit event para abrir modal
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, state]);

  if (!open) {
    return null;
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={handleClose}
      />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
        <div className="w-[640px] bg-surface rounded-composer shadow-modal overflow-hidden">
          <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-1">
            <div>
              <h2 className="text-lg font-semibold text-ink">Nuevo proyecto</h2>
              <p className="mt-1 text-sm text-ink-3 leading-relaxed">
                Describe qué quieres construir y dónde. Lo demás lo decide el planner.
              </p>
            </div>
            <button
              onClick={handleClose}
              disabled={state === "creating"}
              className="p-1.5 text-ink-4 hover:bg-muted rounded-btn disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Cerrar"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>

          <div className="px-6 py-4 flex flex-col gap-4">
            {/* Objetivo */}
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-2">Objetivo</span>
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="Calculadora web con operaciones básicas, historial y tests…"
                disabled={state === "creating"}
                className="rounded-btn border border-line-strong bg-surface px-3 py-2.5 text-sm leading-relaxed outline-none placeholder:text-ink-4 focus:border-primary focus:ring-1 focus:ring-primary-soft disabled:bg-muted resize-none h-24"
              />
            </label>

            {/* Adjuntos (placeholder) */}
            <div className="flex gap-2 flex-wrap">
              {/* TODO: Mostrar adjuntos cuando se implementen */}
              <button className="inline-flex items-center justify-center gap-1.5 rounded-chip border border-line-strong bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-2 hover:bg-muted">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4L15.5 7" />
                </svg>
                Adjuntar
              </button>
            </div>

            {/* Nombre y Carpeta */}
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink-2">Nombre</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={autoName || "calc-web"}
                  disabled={state === "creating"}
                  className="font-mono rounded-btn border border-line-strong bg-surface px-3 py-2 text-xs outline-none placeholder:text-ink-4 focus:border-primary focus:ring-1 focus:ring-primary-soft disabled:bg-muted"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink-2">Carpeta</span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={repoPath}
                    onChange={(e) => setRepoPath(e.target.value)}
                    placeholder="~/proyectos/calc"
                    disabled={state === "creating" || pickingFolder}
                    className="font-mono flex-1 rounded-btn border border-line-strong bg-surface px-3 py-2 text-xs outline-none placeholder:text-ink-4 focus:border-primary focus:ring-1 focus:ring-primary-soft disabled:bg-muted"
                  />
                  <button
                    type="button"
                    onClick={handlePickFolder}
                    disabled={state === "creating" || pickingFolder}
                    className="rounded-btn border border-line-strong bg-surface px-2.5 py-2 text-ink-4 hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Examinar carpeta"
                  >
                    {pickingFolder ? (
                      <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      </svg>
                    )}
                  </button>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-success-text">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
                    <path d="m5 12 5 5 9-10" strokeLinecap="round" />
                  </svg>
                  <span>
                    Repositorio git · rama base <span className="font-mono">main</span>
                  </span>
                </div>
              </label>
            </div>

            {/* Agentes */}
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-2">Agentes</span>
              <div className="flex gap-2 flex-wrap">
                {agents.map((agent) => (
                  <label
                    key={agent.id}
                    className={clsx(
                      "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium border cursor-pointer transition-colors",
                      selectedAgents.includes(agent.id)
                        ? "bg-primary-soft text-primary-soft-text border-primary"
                        : !agent.available
                          ? "opacity-50 cursor-not-allowed bg-muted text-ink-4 border-line"
                          : "bg-surface border-line-strong text-ink-2 hover:bg-muted",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedAgents.includes(agent.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedAgents([...selectedAgents, agent.id]);
                        } else {
                          setSelectedAgents(selectedAgents.filter((a) => a !== agent.id));
                        }
                      }}
                      disabled={!agent.available || state === "creating"}
                      className="w-4 h-4"
                    />
                    {agent.label}
                  </label>
                ))}
              </div>
            </label>

            {/* Más opciones */}
            <button
              type="button"
              onClick={() => setShowMore(!showMore)}
              className="flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink p-0 border-0 bg-transparent"
              aria-expanded={showMore}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
                style={{ transform: showMore ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 200ms' }}
              >
                <path d="m9 6 6 6-6 6" strokeLinecap="round" />
              </svg>
              Más opciones
              <span className="text-xs font-normal text-ink-4">· remoto de GitHub, planificar al crear</span>
            </button>

            {/* Más opciones - Contenido expandible */}
            {showMore && (
              <div className="flex flex-col gap-3 pt-2 border-t border-line-soft">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-ink-2">Remoto de GitHub (opcional)</span>
                  <input
                    type="text"
                    value={remoteUrl}
                    onChange={(e) => setRemoteUrl(e.target.value)}
                    placeholder="https://github.com/usuario/repo"
                    disabled={state === "creating"}
                    className="font-mono rounded-btn border border-line-strong bg-surface px-3 py-2 text-xs outline-none placeholder:text-ink-4 focus:border-primary focus:ring-1 focus:ring-primary-soft disabled:bg-muted"
                  />
                  <div className="text-xs text-warning-text bg-warning-soft rounded px-2 py-1.5">
                    ⚠️ Requiere <span className="font-mono">GITHUB_TOKEN</span> en variables de entorno
                  </div>
                </label>

                <label className="flex items-center gap-2.5 p-2.5 border border-line rounded-btn cursor-pointer hover:bg-subtle transition-colors">
                  <input
                    type="checkbox"
                    checked={planOnCreate}
                    onChange={(e) => setPlanOnCreate(e.target.checked)}
                    disabled={state === "creating"}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium text-ink-2">
                    Generar el plan al crear
                    <div className="text-xs font-normal text-ink-4 mt-0.5">
                      Si lo activas, el proyecto pasará a estado "planning" tras crearse
                    </div>
                  </span>
                </label>
              </div>
            )}

            {/* Error */}
            {state === "error" && error && (
              <div className="rounded-block bg-danger-soft border border-danger px-3 py-2 text-sm text-danger-text">
                {error}
              </div>
            )}

            {/* Creando... */}
            {state === "creating" && (
              <div className="rounded-block bg-primary-soft border border-primary px-3 py-3 flex items-center gap-2 text-sm text-primary-soft-text">
                <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Creando proyecto…
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 px-6 py-3 border-t border-line bg-subtle">
            <div className="flex items-center gap-2 text-xs text-ink-4">
              <kbd className="rounded border border-line-strong bg-surface px-1.5 py-0.5 font-mono">⌘</kbd>
              <kbd className="rounded border border-line-strong bg-surface px-1.5 py-0.5 font-mono">↵</kbd>
              <span>para crear</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleClose}
                disabled={state === "creating"}
                className="rounded-btn border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-muted disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={state === "creating" || !goal.trim()}
                className={clsx(
                  "rounded-btn px-3 py-1.5 text-sm font-medium text-surface inline-flex items-center gap-1.5",
                  state === "creating"
                    ? "bg-primary-hover cursor-not-allowed opacity-75"
                    : "bg-primary hover:bg-primary-hover",
                )}
              >
                {state === "creating" ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Creando…
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M7 4.5v15l12.5-7.5z" />
                    </svg>
                    Crear y planificar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
