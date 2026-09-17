"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  AGENT_CHOICES,
  agentToChoice,
  choiceToAgent,
  type AgentChoice,
} from "@/lib/agents";
import type { AgentSpec, AppInfo, FolderCheck, RemoteCheck } from "@/lib/types";
import { clsx } from "@/lib/cx";
import { AttachmentUpload } from "./AttachmentUpload";

type ModalState = "idle" | "error" | "creating";

interface ProcessedAttachment {
  id: string;
  name: string;
  type: "image" | "markdown";
  mimeType: string;
  size: number;
  data: string;
}

/** Pasos que se muestran mientras se crea (pantalla 2-3 del handoff). */
type StepId = "repo" | "project" | "plan" | "chat";
type StepState = "pending" | "doing" | "done";

const STEP_LABELS: Record<StepId, string> = {
  repo: "Preparar el repositorio",
  project: "Crear el proyecto",
  plan: "Generar el plan",
  chat: "Abrir el chat",
};

const DEBOUNCE_MS = 500;

export function NewProjectModal({
  open,
  onClose,
  initialGoal = "",
}: {
  open: boolean;
  onClose: () => void;
  initialGoal?: string;
}) {
  const router = useRouter();
  const [goal, setGoal] = useState(initialGoal);
  const [name, setName] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [planOnCreate, setPlanOnCreate] = useState(true);
  const [selectedAgents, setSelectedAgents] = useState<AgentChoice[]>([]);
  const [showMore, setShowMore] = useState(false);
  const [state, setState] = useState<ModalState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [steps, setSteps] = useState<Record<StepId, StepState>>({
    repo: "pending",
    project: "pending",
    plan: "pending",
    chat: "pending",
  });
  const [pickingFolder, setPickingFolder] = useState(false);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [attachments, setAttachments] = useState<ProcessedAttachment[]>([]);

  const [folderCheck, setFolderCheck] = useState<FolderCheck | null>(null);
  const [checkingFolder, setCheckingFolder] = useState(false);
  const [remoteCheck, setRemoteCheck] = useState<RemoteCheck | null>(null);
  const [checkingRemote, setCheckingRemote] = useState(false);

  useEffect(() => {
    if (!open) return;

    setGoal(initialGoal);
    void api
      .info()
      .then((info) => {
        setAppInfo(info);
        // Los agentes vienen marcados según lo configurado en Ajustes.
        setSelectedAgents(info.config.defaultAllowedAgents.map(agentToChoice));
      })
      .catch(() => setAppInfo(null));
  }, [open, initialGoal]);

  // Validación en vivo de la carpeta: lo que se pinta sale del backend, no de
  // un texto fijo.
  useEffect(() => {
    const path = repoPath.trim();

    if (!path) {
      setFolderCheck(null);
      setCheckingFolder(false);
      return;
    }

    setCheckingFolder(true);
    const timer = setTimeout(() => {
      let cancelled = false;

      void api
        .checkFolder(path)
        .then((check) => {
          if (!cancelled) setFolderCheck(check);
        })
        .catch(() => {
          if (!cancelled) setFolderCheck(null);
        })
        .finally(() => {
          if (!cancelled) setCheckingFolder(false);
        });

      return () => {
        cancelled = true;
      };
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [repoPath]);

  useEffect(() => {
    const url = remoteUrl.trim();

    if (!url) {
      setRemoteCheck(null);
      setCheckingRemote(false);
      return;
    }

    setCheckingRemote(true);
    const timer = setTimeout(() => {
      void api
        .checkRemote(url)
        .then(setRemoteCheck)
        .catch(() => setRemoteCheck(null))
        .finally(() => setCheckingRemote(false));
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [remoteUrl]);

  const agents = AGENT_CHOICES.map((choice) => {
    const spec = choiceToAgent(choice.value);
    return {
      ...choice,
      spec,
      available:
        appInfo?.agents?.some(
          (agent) => agent.provider === spec.provider && agent.connected,
        ) ?? false,
    };
  });

  const autoName =
    goal
      .split(" ")
      .slice(0, 3)
      .join("-")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "") || "";

  const handlePickFolder = async () => {
    setPickingFolder(true);
    try {
      const result = await api.pickFolder();
      if (result.path) setRepoPath(result.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir el selector");
      setState("error");
    } finally {
      setPickingFolder(false);
    }
  };

  const reset = useCallback(() => {
    setGoal("");
    setName("");
    setRepoPath("");
    setRemoteUrl("");
    setPlanOnCreate(true);
    setShowMore(false);
    setState("idle");
    setError(null);
    setCreatedProjectId(null);
    setAttachments([]);
    setFolderCheck(null);
    setRemoteCheck(null);
    setSteps({
      repo: "pending",
      project: "pending",
      plan: "pending",
      chat: "pending",
    });
  }, []);

  const handleClose = useCallback(() => {
    if (state === "creating") return;
    reset();
    onClose();
  }, [state, reset, onClose]);

  const blockingFolderError =
    folderCheck && !folderCheck.exists && !folderCheck.creatable
      ? (folderCheck.error ?? "La carpeta no es accesible.")
      : null;
  const blockingRemoteError =
    remoteCheck && remoteCheck.checked && !remoteCheck.ok
      ? (remoteCheck.error ?? "No se pudo acceder al remoto.")
      : null;

  const canCreate =
    goal.trim().length > 0 &&
    state !== "creating" &&
    !checkingFolder &&
    !checkingRemote &&
    !blockingFolderError &&
    !blockingRemoteError;

  const handleCreate = useCallback(async () => {
    if (!goal.trim()) {
      setError("Describe el objetivo del proyecto.");
      setState("error");
      return;
    }

    setState("creating");
    setError(null);
    setSteps({
      repo: repoPath.trim() ? "doing" : "done",
      project: repoPath.trim() ? "pending" : "doing",
      plan: "pending",
      chat: "pending",
    });

    try {
      const allowed: AgentSpec[] = selectedAgents.map(choiceToAgent);

      const project = await api.createProject({
        goal: goal.trim(),
        name: name.trim() || autoName || undefined,
        repoPath: repoPath.trim() || undefined,
        remoteUrl: remoteUrl.trim() || undefined,
        ...(allowed.length > 0 ? { defaultAllowedAgents: allowed } : {}),
      });

      setCreatedProjectId(project.id);
      setSteps((current) => ({
        ...current,
        repo: "done",
        project: "done",
        plan: planOnCreate ? "doing" : "done",
      }));

      if (planOnCreate) {
        await api.generatePlan(project.id);
        setSteps((current) => ({ ...current, plan: "done" }));
      }

      setSteps((current) => ({ ...current, chat: "doing" }));

      // Los adjuntos del objetivo abren el primer chat con ellos.
      if (attachments.length > 0) {
        await api.createChat(project.id, {
          message: goal.trim(),
          attachments: attachments.map(({ id: _id, ...rest }) => rest),
        });
      }

      setSteps((current) => ({ ...current, chat: "done" }));
      router.push(`/projects/${project.id}`);
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear el proyecto");
      setState("error");
    }
  }, [
    goal,
    name,
    autoName,
    repoPath,
    remoteUrl,
    selectedAgents,
    planOnCreate,
    attachments,
    router,
    reset,
    onClose,
  ]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleClose();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        if (canCreate) void handleCreate();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, handleClose, handleCreate, canCreate]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-ink/30 z-40" onClick={handleClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-project-title"
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50"
      >
        <div className="max-h-[90vh] w-[640px] overflow-y-auto rounded-composer bg-surface shadow-modal">
          <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-1">
            <div>
              <h2 id="new-project-title" className="text-lg font-semibold text-ink">
                Nuevo proyecto
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-3">
                Describe qué quieres construir y dónde. Lo demás lo decide el
                planner.
              </p>
            </div>
            <button
              onClick={handleClose}
              disabled={state === "creating"}
              className="focus-ring rounded-btn p-1.5 text-ink-4 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Cerrar"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>

          <div className="flex flex-col gap-4 px-6 py-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-2">Objetivo</span>
              <textarea
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                placeholder="Calculadora web con operaciones básicas, historial y tests…"
                disabled={state === "creating"}
                className="h-24 resize-none rounded-btn border border-line-strong bg-surface px-3 py-2.5 text-sm leading-relaxed outline-none placeholder:text-ink-4 focus:border-primary focus:ring-1 focus:ring-primary-soft disabled:bg-muted"
              />
            </label>

            <AttachmentUpload
              attachments={attachments}
              onAdd={(attachment) =>
                setAttachments((current) => [...current, attachment])
              }
              onRemove={(id) =>
                setAttachments((current) =>
                  current.filter((attachment) => attachment.id !== id),
                )
              }
              disabled={state === "creating"}
            />

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink-2">Nombre</span>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={autoName || "calc-web"}
                  disabled={state === "creating"}
                  className="rounded-btn border border-line-strong bg-surface px-3 py-2 font-mono text-xs outline-none placeholder:text-ink-4 focus:border-primary focus:ring-1 focus:ring-primary-soft disabled:bg-muted"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink-2">Carpeta</span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={repoPath}
                    onChange={(event) => setRepoPath(event.target.value)}
                    placeholder="~/proyectos/calc"
                    disabled={state === "creating" || pickingFolder}
                    className="flex-1 rounded-btn border border-line-strong bg-surface px-3 py-2 font-mono text-xs outline-none placeholder:text-ink-4 focus:border-primary focus:ring-1 focus:ring-primary-soft disabled:bg-muted"
                  />
                  <button
                    type="button"
                    onClick={() => void handlePickFolder()}
                    disabled={state === "creating" || pickingFolder}
                    className="focus-ring rounded-btn border border-line-strong bg-surface px-2.5 py-2 text-ink-4 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Examinar carpeta"
                    title="Examinar carpeta"
                  >
                    {pickingFolder ? (
                      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      </svg>
                    )}
                  </button>
                </div>
                <FolderStatus check={folderCheck} checking={checkingFolder} />
              </label>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-2">Agentes</span>
              <div className="flex flex-wrap gap-2">
                {agents.map((agent) => {
                  const selected = selectedAgents.includes(agent.value);

                  return (
                    <label
                      key={agent.value}
                      title={
                        agent.available
                          ? undefined
                          : "Este agente no está disponible ahora mismo"
                      }
                      className={clsx(
                        "inline-flex cursor-pointer items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                        selected
                          ? "border-primary bg-primary-soft text-primary-soft-text"
                          : !agent.available
                            ? "cursor-not-allowed border-line bg-muted text-ink-4 opacity-60"
                            : "border-line-strong bg-surface text-ink-2 hover:bg-muted",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(event) =>
                          setSelectedAgents((current) =>
                            event.target.checked
                              ? [...current, agent.value]
                              : current.filter((item) => item !== agent.value),
                          )
                        }
                        disabled={!agent.available || state === "creating"}
                        className="h-4 w-4 accent-primary"
                      />
                      {agent.label}
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-ink-4">
                Los chats del proyecto empiezan con estos agentes. Sin ninguno
                marcado, el motor elige libremente.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowMore(!showMore)}
              className="focus-ring flex items-center gap-1.5 border-0 bg-transparent p-0 text-sm font-medium text-ink-2 hover:text-ink"
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
                style={{
                  transform: showMore ? "rotate(90deg)" : "rotate(0)",
                  transition: "transform 200ms",
                }}
              >
                <path d="m9 6 6 6-6 6" strokeLinecap="round" />
              </svg>
              Más opciones
              <span className="text-xs font-normal text-ink-4">
                · remoto de GitHub, planificar al crear
              </span>
            </button>

            {showMore && (
              <div className="flex flex-col gap-3 border-t border-line-soft pt-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-ink-2">
                    Remoto de GitHub (opcional)
                  </span>
                  <input
                    type="text"
                    value={remoteUrl}
                    onChange={(event) => setRemoteUrl(event.target.value)}
                    placeholder="https://github.com/usuario/repo"
                    disabled={state === "creating"}
                    className="rounded-btn border border-line-strong bg-surface px-3 py-2 font-mono text-xs outline-none placeholder:text-ink-4 focus:border-primary focus:ring-1 focus:ring-primary-soft disabled:bg-muted"
                  />
                  <RemoteStatus check={remoteCheck} checking={checkingRemote} />
                </label>

                <label className="flex cursor-pointer items-center gap-2.5 rounded-btn border border-line p-2.5 transition-colors hover:bg-subtle">
                  <input
                    type="checkbox"
                    checked={planOnCreate}
                    onChange={(event) => setPlanOnCreate(event.target.checked)}
                    disabled={state === "creating"}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="text-sm font-medium text-ink-2">
                    Generar el plan al crear
                    <span className="mt-0.5 block text-xs font-normal text-ink-4">
                      Si lo desactivas, el proyecto se queda en borrador hasta
                      que lo planifiques.
                    </span>
                  </span>
                </label>
              </div>
            )}

            {state === "error" && error && (
              <div
                role="alert"
                className="rounded-block border border-danger bg-danger-soft px-3 py-2 text-sm text-danger-text"
              >
                {error}
              </div>
            )}

            {state === "creating" && (
              <div
                aria-live="polite"
                className="space-y-2 rounded-block border border-line bg-subtle px-3 py-3"
              >
                {(Object.keys(STEP_LABELS) as StepId[])
                  .filter((step) => step !== "plan" || planOnCreate)
                  .map((step) => (
                    <Step key={step} label={STEP_LABELS[step]} state={steps[step]} />
                  ))}
                {createdProjectId && (
                  <button
                    type="button"
                    onClick={() => {
                      router.push(`/projects/${createdProjectId}`);
                      onClose();
                    }}
                    className="focus-ring mt-1 text-xs font-medium text-primary hover:text-primary-hover"
                  >
                    Ir al chat ahora
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-line bg-subtle px-6 py-3">
            <div className="flex items-center gap-2 text-xs text-ink-4">
              <kbd className="rounded border border-line-strong bg-surface px-1.5 py-0.5 font-mono">
                ⌘
              </kbd>
              <kbd className="rounded border border-line-strong bg-surface px-1.5 py-0.5 font-mono">
                ↵
              </kbd>
              <span>para crear</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleClose}
                disabled={state === "creating"}
                className="focus-ring rounded-btn border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-muted disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleCreate()}
                disabled={!canCreate}
                className={clsx(
                  "focus-ring inline-flex items-center gap-1.5 rounded-btn px-3 py-1.5 text-sm font-medium text-surface",
                  canCreate
                    ? "bg-primary hover:bg-primary-hover"
                    : "cursor-not-allowed bg-primary opacity-60",
                )}
              >
                {state === "creating" ? (
                  <>
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Creando…
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M7 4.5v15l12.5-7.5z" />
                    </svg>
                    {planOnCreate ? "Crear y planificar" : "Crear proyecto"}
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

function Step({ label, state }: { label: string; state: StepState }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {state === "done" ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" className="text-success" aria-hidden>
          <path d="m5 12 5 5 9-10" strokeLinecap="round" />
        </svg>
      ) : state === "doing" ? (
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      ) : (
        <span className="inline-block h-3.5 w-3.5 rounded-full border border-line-strong" />
      )}
      <span className={state === "pending" ? "text-ink-4" : "text-ink-2"}>
        {label}
      </span>
    </div>
  );
}

function FolderStatus({
  check,
  checking,
}: {
  check: FolderCheck | null;
  checking: boolean;
}) {
  if (checking) {
    return <span className="text-xs text-ink-4">Comprobando la carpeta…</span>;
  }

  if (!check) {
    return (
      <span className="text-xs text-ink-4">
        Si la dejas vacía se usa el repositorio actual.
      </span>
    );
  }

  if (!check.exists && !check.creatable) {
    return (
      <span className="text-xs text-danger-text">
        {check.error ?? "La carpeta no es accesible."}
      </span>
    );
  }

  if (!check.exists) {
    return (
      <span className="text-xs text-ink-3">
        La carpeta no existe todavía: se creará e inicializará como repositorio.
      </span>
    );
  }

  if (!check.isRepo) {
    return (
      <span className="text-xs text-ink-3">
        Carpeta sin git: se inicializará un repositorio.
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 text-xs text-success-text">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
        <path d="m5 12 5 5 9-10" strokeLinecap="round" />
      </svg>
      <span>
        Repositorio git
        {check.branch && (
          <>
            {" · rama base "}
            <span className="font-mono">{check.branch}</span>
          </>
        )}
        {check.dirty && " · tiene cambios sin commitear"}
      </span>
    </span>
  );
}

function RemoteStatus({
  check,
  checking,
}: {
  check: RemoteCheck | null;
  checking: boolean;
}) {
  if (checking) {
    return <span className="text-xs text-ink-4">Comprobando el remoto…</span>;
  }

  if (!check) return null;

  if (check.needsToken) {
    return (
      <span className="rounded px-2 py-1.5 text-xs text-warning-text bg-warning-soft">
        Define <span className="font-mono">GITHUB_TOKEN</span> para comprobar el
        remoto y poder publicar la rama final.
      </span>
    );
  }

  if (!check.ok) {
    return (
      <span className="text-xs text-danger-text">
        {check.error ?? "No se pudo acceder al remoto."}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 text-xs text-success-text">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
        <path d="m5 12 5 5 9-10" strokeLinecap="round" />
      </svg>
      Remoto accesible
    </span>
  );
}
