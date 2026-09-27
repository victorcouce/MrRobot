"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { api, type OutgoingAttachment } from "@/lib/api";
import { monoAgentLabel } from "@/lib/agents";
import { clsx } from "@/lib/cx";
import { clockTime } from "@/lib/format";
import { useChat, useProjects } from "@/lib/hooks";
import { takePendingMessage } from "@/lib/pending-message";
import { chatHref } from "@/lib/sidebar";
import type { ChatMessage } from "@/lib/types";
import { AttachmentPreview } from "../AttachmentPreview";
import { ThreadComposer } from "../projects/ThreadComposer";
import { RenameInput } from "../sidebar/RenameInput";
import { RowMenu } from "../sidebar/RowMenu";
import { chatTitle, useItemActions } from "../sidebar/useItemActions";
import { LoadingState } from "../ui/Badge";
import { RobotAvatar } from "../ui/Chip";
import { WaveDots } from "../ui/WaveDots";

interface Draft {
  content: string;
  attachments?: OutgoingAttachment[];
}

function UserBubble({
  content,
  attachments,
}: Pick<ChatMessage, "content" | "attachments">) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[560px] rounded-[18px_18px_4px_18px] bg-user-bubble px-4 py-[11px]">
        <p className="whitespace-pre-wrap text-[15px] leading-normal text-ink">{content}</p>
        <AttachmentPreview attachments={attachments} />
      </div>
    </div>
  );
}

function AssistantMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-[12.5px] text-ink-4">
        <RobotAvatar />
        <span className="font-medium text-ink">MrRobot</span>
        <span>
          {monoAgentLabel(message.agent)} · {clockTime(message.createdAt)}
        </span>
      </div>
      {message.error ? (
        <p className="flex items-start gap-2 rounded-btn border border-danger bg-danger-soft px-3 py-2 text-[14px] text-danger-text">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {message.content}
        </p>
      ) : (
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">
          {message.content}
        </p>
      )}
    </div>
  );
}

/**
 * Chat suelto, sin proyecto: conversación con un agente que no toca archivos.
 * Si el chat se mueve a un proyecto, su sitio pasa a ser el hilo del proyecto.
 */
export function ChatView({ id }: { id: string }) {
  const router = useRouter();
  const { chat, notFound, loading, refresh } = useChat(id);
  const { projects } = useProjects();
  const actions = useItemActions({ projects });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pendingTaken = useRef<string | null>(null);

  async function send(content: string, attachments?: OutgoingAttachment[]) {
    setDraft({ content, ...(attachments ? { attachments } : {}) });
    setSendError(null);
    try {
      await api.sendMessageToChat(id, content, attachments);
      await refresh();
    } catch (error) {
      setSendError(error instanceof Error ? error.message : String(error));
    } finally {
      setDraft(null);
    }
  }

  // El primer mensaje llega desde el inicio: se envía al abrir el chat.
  useEffect(() => {
    if (pendingTaken.current === id) return;
    pendingTaken.current = id;
    const pending = takePendingMessage(id);
    if (pending) void send(pending.content, pending.attachments);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (notFound) router.replace("/");
  }, [notFound, router]);

  // Movido a un proyecto: se sigue en el hilo del proyecto.
  useEffect(() => {
    if (chat?.projectId) router.replace(chatHref(chat));
  }, [chat, router]);

  const messageCount = chat?.messages.length ?? 0;
  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ block: "end" });
  }, [messageCount, draft]);

  if (loading && !chat) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingState />
      </div>
    );
  }

  if (!chat) return null;

  const title = chatTitle(chat);
  const empty = chat.messages.length === 0 && !draft;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line-soft px-4">
        {editing ? (
          <RenameInput
            initial={title}
            label="Nuevo nombre del chat"
            onSave={(next) => {
              setEditing(false);
              void actions.renameChat(chat, next);
            }}
            onCancel={() => setEditing(false)}
            className="h-8 min-w-0 max-w-md flex-1 rounded-md border border-primary bg-surface px-2 text-[14px] text-ink outline-none ring-2 ring-primary-soft"
          />
        ) : (
          <h1
            className="min-w-0 truncate text-[14px] font-medium text-ink"
            onDoubleClick={() => setEditing(true)}
            title="Doble clic para renombrar"
          >
            {title}
          </h1>
        )}
        {chat.archivedAt && (
          <span className="rounded-chip bg-muted px-2 py-0.5 text-[11.5px] text-ink-3">
            Archivado
          </span>
        )}
        <div className="ml-auto">
          <RowMenu
            label={`Opciones de ${title}`}
            items={actions.chatMenu(chat, { onRename: () => setEditing(true) })}
          />
        </div>
      </header>

      {actions.error && (
        <div
          role="alert"
          className="border-b border-danger bg-danger-soft px-4 py-2 text-[13px] text-danger-text"
        >
          {actions.error}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <RobotAvatar size={36} />
            <h2 className="font-display text-2xl font-medium text-ink">¿En qué puedo ayudarte?</h2>
            <p className="max-w-md text-[14px] text-ink-3">
              Un chat sin proyecto sirve para pensar en voz alta. Cuando quieras
              construirlo, muévelo a un proyecto desde «⋯».
            </p>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-[820px] flex-col gap-6 px-6 py-8">
            {chat.messages.map((message) =>
              message.role === "user" ? (
                <UserBubble
                  key={message.id}
                  content={message.content}
                  attachments={message.attachments}
                />
              ) : (
                <AssistantMessage key={message.id} message={message} />
              ),
            )}
            {draft && (
              <>
                <UserBubble content={draft.content} />
                <div className="flex items-center gap-2 text-[13px] text-ink-4">
                  <RobotAvatar />
                  <WaveDots label="MrRobot está respondiendo" />
                </div>
              </>
            )}
            {sendError && (
              <p
                role="alert"
                className={clsx(
                  "rounded-btn border border-danger bg-danger-soft px-3 py-2 text-[13px] text-danger-text",
                )}
              >
                {sendError}
              </p>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <ThreadComposer
        status="ready"
        disabled={draft !== null}
        onSendMessage={(message, attachments) =>
          send(
            message.trim(),
            attachments?.map(({ id: _id, ...attachment }) => attachment),
          )
        }
        placeholder="Pregunta lo que quieras…"
        hint="Chat sin proyecto: el agente conversa y no toca archivos. Muévelo a un proyecto para planificar."
      />

      {actions.dialogs}
    </div>
  );
}
