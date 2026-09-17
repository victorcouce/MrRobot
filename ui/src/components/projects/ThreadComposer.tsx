"use client";

import { useState } from "react";
import { Button } from "../ui/Button";

interface ThreadComposerProps {
  status: string;
  onSendMessage: (message: string) => Promise<void>;
  onPauseAndWrite?: (() => Promise<void>) | (() => void);
  disabled?: boolean;
  loading?: boolean;
}

export function ThreadComposer({
  status,
  onSendMessage,
  onPauseAndWrite,
  disabled,
  loading,
}: ThreadComposerProps) {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isRunning = status === "running";
  const isPlanning = status === "planning";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() || submitting) return;

    setSubmitting(true);
    try {
      await onSendMessage(message);
      setMessage("");
    } finally {
      setSubmitting(false);
    }
  }

  if (isRunning) {
    return (
      <div className="border-t border-line bg-surface px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-[820px]">
          <div className="rounded-lg bg-primary-soft p-4">
            <p className="text-sm text-primary-soft-text">
              El chat se reabre cuando la ejecución termine o la pauses.
            </p>
            {onPauseAndWrite && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => void onPauseAndWrite()}
                className="mt-2"
              >
                Pausar y escribir
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isPlanning) {
    return (
      <div className="border-t border-line bg-surface px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-[820px]">
          <div className="flex items-center gap-2 text-sm text-ink-3">
            <svg
              className="h-4 w-4 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Generando plan…
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-line bg-surface px-4 py-4 sm:px-6">
      <div className="mx-auto max-w-[820px]">
        <div className="flex gap-2">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Escribe un mensaje…"
            disabled={disabled || submitting}
            rows={3}
            className="flex-1 resize-none rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder-ink-4 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-muted disabled:text-ink-4"
          />
          <div className="flex flex-col gap-2">
            <Button
              type="submit"
              variant="primary"
              disabled={!message.trim() || disabled || submitting}
              loading={submitting}
            >
              Enviar
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
