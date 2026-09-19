"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAppInfo } from "@/lib/hooks";
import { RobotLottie } from "@/components/RobotLottie";
import { ChatAgentSelector } from "@/components/ChatAgentSelector";
import { clsx } from "@/lib/cx";
import { autoProjectName } from "@/lib/format";
import { hasFileWritingAgent } from "@/lib/agents";
import type { AgentSpec } from "@/lib/types";

const TITLES = [
  "¿Qué construimos hoy?",
  "¿Qué destrozamos hoy?",
  "¿Qué obra maestra (o no) creamos hoy?",
  "¿Qué magia negra programamos hoy?",
  "¿Qué bug sembramos hoy?",
  "¿Qué caos organizado montamos hoy?",
  "¿Qué castillo de arena levantamos hoy?",
  "¿Qué Frankenstein ensamblamos hoy?",
  "¿Qué parche apagafuegos aplicamos hoy?",
  "¿Qué genialidad medio dudosa construimos hoy?",
  "¿Qué desastre con clase armamos hoy?",
];

export default function HomePage() {
  const { info } = useAppInfo();
  const router = useRouter();
  const [goal, setGoal] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [pickingFolder, setPickingFolder] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [selectedAgents, setSelectedAgents] = useState<AgentSpec[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [folderError, setFolderError] = useState(false);
  const [folderShake, setFolderShake] = useState(false);
  const agentsInitialized = useRef(false);
  const goalRef = useRef<HTMLTextAreaElement>(null);
  const [title] = useState(() => TITLES[Math.floor(Math.random() * TITLES.length)]);

  // Los agentes marcados por defecto en Ajustes son el punto de partida.
  useEffect(() => {
    if (!info || agentsInitialized.current) return;
    agentsInitialized.current = true;
    setSelectedAgents(info.config?.defaultAllowedAgents ?? []);
  }, [info]);

  // Al elegir carpeta se limpia el resaltado de error.
  useEffect(() => {
    if (repoPath.trim()) setFolderError(false);
  }, [repoPath]);

  // El campo crece con el contenido hasta 7 líneas y luego hace scroll.
  useEffect(() => {
    const el = goalRef.current;
    if (!el) return;
    el.style.height = "auto";
    const style = getComputedStyle(el);
    const lineHeight = parseFloat(style.lineHeight) || 27;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const paddingBottom = parseFloat(style.paddingBottom) || 0;
    const max = lineHeight * 7 + paddingTop + paddingBottom;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [goal]);

  const submit = async () => {
    if (!goal.trim() || creating) return;
    if (!repoPath.trim()) {
      setFolderError(true);
      setFolderShake(true);
      return;
    }

    setCreating(true);
    setCreateError(null);

    try {
      const project = await api.createProject({
        goal: goal.trim(),
        name: autoProjectName(goal.trim()),
        repoPath: repoPath.trim(),
        ...(selectedAgents.length > 0
          ? { defaultAllowedAgents: selectedAgents }
          : {}),
      });
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "No se pudo crear el proyecto",
      );
      setCreating(false);
    }
  };

  const missingFileWriter =
    selectedAgents.length > 0 && !hasFileWritingAgent(selectedAgents);

  const handlePickFolder = async () => {
    setPickingFolder(true);
    setPickError(null);
    try {
      const result = await api.pickFolder();
      if (result.path) setRepoPath(result.path);
    } catch (err) {
      setPickError(
        err instanceof Error ? err.message : "No se pudo abrir el selector",
      );
    } finally {
      setPickingFolder(false);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center px-12 py-12">
      {info?.mock && (
        <div className="absolute top-0 left-0 right-0 bg-warning-soft px-4 py-2 text-center text-sm text-warning-text">
          🧪 Modo simulado (MRROBOT_MOCK=1): sin tokens ni cambios en Git
        </div>
      )}

      <div className="mb-10 flex animate-slide-up flex-col items-center gap-2 motion-reduce:animate-none">
        <RobotLottie className="mb-2 h-40 w-40" />
        <h1
          suppressHydrationWarning
          className="font-display text-4xl font-medium tracking-tight text-ink"
        >
          {title}
        </h1>
        <p className="text-base text-ink-3">
          Describe el objetivo. MrRobot lo planifica, lo reparte entre agentes y
          lo deja en una rama aparte.
        </p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="w-full max-w-[820px] animate-slide-up rounded-composer border border-line-strong bg-surface shadow-block motion-reduce:animate-none"
        style={{ animationDelay: "90ms" }}
      >
        <label htmlFor="goal" className="sr-only">
          Objetivo del proyecto
        </label>
        <textarea
          id="goal"
          ref={goalRef}
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder="Crea una calculadora web con historial y tests…"
          className="w-full resize-none border-0 bg-transparent p-5 font-sans text-lg leading-normal outline-none"
        />

        <div className="flex items-center justify-between gap-3 border-t border-line-soft px-4 py-3">
          <div className="flex min-w-0 items-center gap-2 text-xs text-ink-4">
            <button
              type="button"
              onClick={() => void handlePickFolder()}
              disabled={pickingFolder}
              title={repoPath || "Seleccionar carpeta"}
              aria-label={
                repoPath ? `Carpeta: ${repoPath}. Cambiar carpeta` : "Seleccionar carpeta"
              }
              onAnimationEnd={() => setFolderShake(false)}
              className={clsx(
                "focus-ring inline-flex max-w-[240px] items-center gap-1.5 rounded-btn border bg-surface px-2.5 py-1.5 text-xs text-ink-2 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50",
                folderError
                  ? "border-ink ring-1 ring-ink/20"
                  : "border-line-strong",
                folderShake && "shake-x",
              )}
            >
              {pickingFolder ? (
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
              )}
              <span className="truncate font-mono">
                {repoPath || "Carpeta"}
              </span>
            </button>
            {pickError && <span className="text-danger-text">{pickError}</span>}
            <ChatAgentSelector
              allowedAgents={selectedAgents}
              agentAvailability={info?.agents}
              onSelect={setSelectedAgents}
            />
            {missingFileWriter && (
              <span className="text-danger-text">
                Añade Codex o Claude para poder crear archivos.
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={!goal.trim() || missingFileWriter || creating}
            className="focus-ring inline-flex items-center justify-center gap-2 rounded-btn bg-primary px-4 py-2 text-sm font-medium text-ink hover:bg-primary-hover disabled:opacity-50"
          >
            {creating ? "Creando…" : "Planificar"}
            {creating ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-ink/20 border-t-ink" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>
      </form>

      {createError && (
        <div
          role="alert"
          className="mt-4 w-full max-w-[820px] rounded-btn border border-danger bg-danger-soft px-4 py-2 text-sm text-danger-text"
        >
          {createError}
        </div>
      )}
    </div>
  );
}
