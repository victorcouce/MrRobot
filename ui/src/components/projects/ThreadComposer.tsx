"use client";

import { useState, useCallback } from "react";
import { Button } from "../ui/Button";
import { AttachmentUpload } from "../AttachmentUpload";
import { ModePicker, type ComposerMode } from "../ModePicker";
import { LockIcon, PaperclipIcon, SendIcon } from "../ui/icons";
import { clsx } from "@/lib/cx";

interface ProcessedAttachment {
  id: string;
  name: string;
  type: "image" | "markdown";
  mimeType: string;
  size: number;
  data: string;
}

interface ThreadComposerProps {
  status: string;
  onSendMessage: (
    message: string,
    attachments?: ProcessedAttachment[],
  ) => Promise<void>;
  onPauseAndWrite?: (() => Promise<void>) | (() => void);
  disabled?: boolean;
  loading?: boolean;
  /** Nota bajo el composer; por defecto la del planner. */
  hint?: string;
  placeholder?: string;
  /** Modo del proyecto; sin él (chat suelto) no se muestra el selector. */
  mode?: ComposerMode | undefined;
  onModeChange?: ((mode: ComposerMode) => void) | undefined;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shrink-0 bg-bg px-6 pb-6 pt-2">
      <div className="mx-auto flex w-full max-w-[820px] flex-col items-center gap-2">
        {children}
      </div>
    </div>
  );
}

export function ThreadComposer({
  status,
  onSendMessage,
  onPauseAndWrite,
  disabled,
  loading,
  hint = "Cada mensaje pasa por el planner. Las tareas hechas nunca se reescriben.",
  placeholder = "Escribe un mensaje… (Enter para enviar, Shift+Enter para nueva línea)",
  mode,
  onModeChange,
}: ThreadComposerProps) {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [attachments, setAttachments] = useState<ProcessedAttachment[]>([]);
  const [showUploader, setShowUploader] = useState(false);

  const isRunning = status === "running";
  const isPlanning = status === "planning";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() || submitting) return;

    setSubmitting(true);
    try {
      await onSendMessage(
        message,
        attachments.length > 0 ? attachments : undefined,
      );
      setMessage("");
      setAttachments([]);
      setShowUploader(false);
    } finally {
      setSubmitting(false);
    }
  }

  const handleAddAttachment = useCallback((att: ProcessedAttachment) => {
    setAttachments((prev) => [...prev, att]);
  }, []);

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  if (isRunning) {
    return (
      <Shell>
        <div className="flex w-full items-center gap-3 rounded-composer border border-line bg-sidebar px-3 py-3.5 pl-[18px]">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-primary-soft text-primary-soft-text">
            <LockIcon />
          </span>
          <span className="flex-1 text-sm text-ink-2">
            El chat se reabre cuando la ejecución termine o la pauses.
          </span>
          {onPauseAndWrite && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void onPauseAndWrite()}
            >
              Pausar y escribir
            </Button>
          )}
        </div>
      </Shell>
    );
  }

  if (isPlanning) {
    return (
      <Shell>
        <div
          role="status"
          className="flex w-full items-center gap-3 rounded-composer border border-line bg-sidebar px-3 py-3.5 pl-[18px]"
        >
          <span
            aria-hidden="true"
            className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-soft border-t-primary"
          />
          <span className="flex-1 text-sm text-ink-2">
            El planner está trabajando. Podrás escribir en cuanto termine.
          </span>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <form
        onSubmit={handleSubmit}
        className="w-full rounded-composer border border-line-strong bg-surface px-3 pb-2.5 pl-[18px] pt-3.5 shadow-[0_1px_2px_rgba(22,22,26,0.04),0_12px_32px_-18px_rgba(22,22,26,0.18)]"
      >
        <AttachmentUpload
          attachments={attachments}
          onAdd={handleAddAttachment}
          onRemove={handleRemoveAttachment}
          disabled={disabled || submitting}
          showDropzone={showUploader}
        />

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={placeholder}
          disabled={disabled || submitting}
          rows={2}
          className="h-[44px] w-full resize-none border-0 bg-transparent text-[15px] leading-normal text-ink outline-none placeholder-ink-4 disabled:opacity-50"
        />

        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-pressed={showUploader}
              onClick={() => setShowUploader((open) => !open)}
              disabled={disabled || submitting}
              className={clsx(
                "focus-ring inline-flex h-7 items-center gap-1.5 rounded-[8px] border bg-surface px-2.5 text-[12.5px] text-ink-2 transition-colors disabled:opacity-50",
                showUploader
                  ? "border-primary ring-2 ring-primary-soft"
                  : "border-line hover:bg-muted",
              )}
            >
              <PaperclipIcon />
              Adjuntar
            </button>
            {mode && onModeChange && (
              <ModePicker
                value={mode}
                onChange={onModeChange}
                disabled={disabled || submitting}
              />
            )}
          </div>

          <button
            type="submit"
            aria-label="Enviar"
            disabled={!message.trim() || disabled || submitting}
            className="focus-ring inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-btn bg-primary text-ink transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {submitting ? (
              <span
                aria-hidden="true"
                className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-ink/20 border-t-ink"
              />
            ) : (
              <SendIcon />
            )}
          </button>
        </div>
      </form>

      <span className="text-[11.5px] text-ink-4">{hint}</span>
    </Shell>
  );
}
