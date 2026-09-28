"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Paperclip } from "lucide-react";
import { api } from "@/lib/api";
import { setPendingMessage } from "@/lib/pending-message";
import { useAppInfo } from "@/lib/hooks";
import { RobotLottie } from "@/components/RobotLottie";
import { AttachmentChip } from "@/components/AttachmentChip";
import { ModePicker, modeConfig, type ComposerMode } from "@/components/ModePicker";
import { NewSpaceDialog } from "@/components/spaces/NewSpaceDialog";
import { SpacePicker } from "@/components/spaces/SpacePicker";
import { hasFileWritingAgent } from "@/lib/agents";
import {
  ATTACHMENT_ACCEPT,
  readAttachment,
  type ProcessedAttachment,
} from "@/lib/attachments";
import type { Space } from "@/lib/types";

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
  return (
    <Suspense fallback={null}>
      <Home />
    </Suspense>
  );
}

/**
 * Inicio = «Nuevo chat», como en ChatGPT. Sin proyecto, el mensaje abre un chat
 * suelto; con un proyecto elegido, se planifica y se reparte entre agentes.
 */
function Home() {
  const { info } = useAppInfo();
  const router = useRouter();
  // «Nuevo proyecto» en la barra lateral llega aquí con el selector abierto.
  const wantsProject = useSearchParams().get("new") === "project";
  const [goal, setGoal] = useState("");
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [space, setSpace] = useState<Space | null>(null);
  const [newSpaceOpen, setNewSpaceOpen] = useState(false);
  const [mode, setMode] = useState<ComposerMode>("review");
  const [attachments, setAttachments] = useState<ProcessedAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [spaceError, setSpaceError] = useState(false);
  const [spaceShake, setSpaceShake] = useState(false);
  const goalRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  const [title] = useState(() => TITLES[Math.floor(Math.random() * TITLES.length)]);

  // Los agentes salen del formulario: se usan siempre los marcados en Ajustes.
  const selectedAgents = info?.config?.defaultAllowedAgents ?? [];

  useEffect(() => {
    api
      .listProjects()
      .then(setSpaces)
      .catch(() => setSpaces([]));
  }, []);

  // Uno a uno, para que el límite total cuente los que se acaban de añadir.
  const addFiles = async (files: File[]) => {
    setAttachmentError(null);
    for (const file of files) {
      const total = attachmentsRef.current.reduce((sum, att) => sum + att.size, 0);
      const result = await readAttachment(file, total);
      if ("error" in result) {
        setAttachmentError(result.error);
        continue;
      }
      attachmentsRef.current = [...attachmentsRef.current, result.attachment];
      setAttachments(attachmentsRef.current);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachmentError(null);
    setAttachments((current) => current.filter((att) => att.id !== id));
  };

  const selectSpace = (next: Space) => {
    setSpace(next);
    setSpaceError(false);
  };

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

  const outgoingAttachments = () =>
    attachments.length > 0
      ? attachments.map(({ id: _id, ...attachment }) => attachment)
      : undefined;

  const startChat = async () => {
    setCreating(true);
    setCreateError(null);

    try {
      const chat = await api.createStandaloneChat({
        ...(selectedAgents.length > 0 ? { allowedAgents: selectedAgents } : {}),
      });
      const pendingAttachments = outgoingAttachments();
      setPendingMessage(chat.id, {
        content: goal.trim(),
        ...(pendingAttachments ? { attachments: pendingAttachments } : {}),
      });
      router.push(`/chats/${chat.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "No se pudo crear el chat");
      setCreating(false);
    }
  };

  const submit = async () => {
    if (!goal.trim() || creating) return;
    if (!space) {
      if (wantsProject) {
        setSpaceError(true);
        setSpaceShake(true);
        return;
      }
      await startChat();
      return;
    }

    setCreating(true);
    setCreateError(null);

    try {
      const projectAttachments = outgoingAttachments();
      const project = await api.createProject({
        goal: goal.trim(),
        name: space.name,
        icon: space.icon,
        repoPath: space.path,
        ...(projectAttachments ? { attachments: projectAttachments } : {}),
        ...(selectedAgents.length > 0
          ? { defaultAllowedAgents: selectedAgents }
          : {}),
        ...(mode !== "review" ? { config: modeConfig(mode) } : {}),
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
          {space || wantsProject
            ? "Describe el objetivo. MrRobot lo planifica, lo reparte entre agentes y lo deja en una rama aparte."
            : "Pregunta o da forma a una idea. Elige un proyecto cuando quieras que MrRobot lo construya."}
        </p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDragging(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void addFiles(Array.from(event.dataTransfer.files));
        }}
        onPaste={(event) => {
          const files = Array.from(event.clipboardData.files);
          if (files.length === 0) return;
          event.preventDefault();
          void addFiles(files);
        }}
        className="relative w-full max-w-[820px] animate-slide-up rounded-composer border border-line-strong bg-surface shadow-block motion-reduce:animate-none"
        style={{ animationDelay: "90ms" }}
      >
        {dragging && (
          <div className="pointer-events-none absolute inset-1.5 z-30 flex items-center justify-center rounded-[14px] border-2 border-dashed border-primary-hover bg-primary-soft/95 text-sm font-medium text-ink">
            Suelta para adjuntar
          </div>
        )}

        <label htmlFor="goal" className="sr-only">
          Mensaje
        </label>
        <textarea
          id="goal"
          ref={goalRef}
          rows={2}
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder={
            space || wantsProject
              ? "Crea una calculadora web con historial y tests…"
              : "Pregunta lo que quieras…"
          }
          className="block w-full resize-none border-0 bg-transparent px-5 pb-3 pt-5 font-sans text-lg leading-normal text-ink outline-none"
        />

        {attachments.length > 0 && (
          <ul aria-label="Adjuntos" className="flex flex-wrap gap-1.5 px-5 pb-2">
            {attachments.map((attachment) => (
              <li key={attachment.id}>
                <AttachmentChip
                  {...attachment}
                  onRemove={() => removeAttachment(attachment.id)}
                />
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between gap-3 px-3 pb-3 pt-1">
          <div className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={creating}
              aria-label="Adjuntar"
              title="Adjuntar (o arrastra, o pega con ⌘V)"
              className="focus-ring flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-btn text-ink-2 transition-colors hover:bg-muted disabled:opacity-50"
            >
              <Paperclip className="h-[17px] w-[17px]" strokeWidth={1.8} aria-hidden />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ATTACHMENT_ACCEPT}
              tabIndex={-1}
              aria-hidden
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                void addFiles(files);
              }}
            />
            <span aria-hidden className="mx-1 h-[18px] w-px shrink-0 bg-line" />
            <SpacePicker
              spaces={spaces}
              selected={space}
              onSelect={selectSpace}
              onCreateNew={() => setNewSpaceOpen(true)}
              onClear={() => setSpace(null)}
              autoOpen={wantsProject}
              invalid={spaceError}
              shake={spaceShake}
              onShakeEnd={() => setSpaceShake(false)}
            />
            {/* El modo solo aplica a proyectos: un chat suelto no planifica. */}
            {space && <ModePicker value={mode} onChange={setMode} />}
          </div>
          <button
            type="submit"
            disabled={!goal.trim() || missingFileWriter || creating}
            className="focus-ring inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-btn bg-primary px-4 text-sm font-medium text-ink hover:bg-primary-hover disabled:opacity-50"
          >
            {creating ? "Creando…" : space || wantsProject ? "Planificar" : "Enviar"}
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

      {(attachmentError || missingFileWriter) && (
        <p role="status" className="mt-3 w-full max-w-[820px] px-1 text-[12.5px] text-danger-text">
          {attachmentError ?? (
            <>
              Los agentes marcados en{" "}
              <Link href="/settings" className="underline hover:text-ink">
                Ajustes
              </Link>{" "}
              no escriben archivos: añade Codex, Claude o DeepSeek.
            </>
          )}
        </p>
      )}

      {createError && (
        <div
          role="alert"
          className="mt-4 w-full max-w-[820px] rounded-btn border border-danger bg-danger-soft px-4 py-2 text-sm text-danger-text"
        >
          {createError}
        </div>
      )}

      <NewSpaceDialog
        open={newSpaceOpen}
        onClose={() => setNewSpaceOpen(false)}
        onCreated={(created) => {
          setSpaces((current) => [...current, created]);
          selectSpace(created);
          setNewSpaceOpen(false);
        }}
      />
    </div>
  );
}
