"use client";

import Link from "next/link";
import type { Project } from "../../lib/types";
import { PROJECT_STATUS } from "../../lib/status";
import { Button } from "../ui/Button";
import { StatusBadge } from "../ui/Badge";
import { ProgressBar } from "../ui/Progress";

interface ThreadHeaderProps {
  project: Project;
  chatName?: string;
  onStart?: (() => void) | (() => Promise<void>);
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
  busy?: string | null;
  pauseRequested?: boolean;
  actionError?: string | null;
}

export function ThreadHeader({
  project,
  chatName,
  onStart,
  onPause,
  onResume,
  onCancel,
  onDelete,
  busy,
  pauseRequested,
  actionError,
}: ThreadHeaderProps) {
  const status = PROJECT_STATUS[project.status];
  const { stats } = project;

  return (
    <div className="border-b border-line bg-surface px-4 sm:px-6">
      <div className="mx-auto flex min-h-14 max-w-[1060px] flex-wrap items-center justify-between gap-4 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <h1 className="min-w-0 truncate text-sm font-semibold text-ink">
            {project.name}
            {chatName && (
              <span className="font-normal text-ink-3"> / {chatName}</span>
            )}
          </h1>
          <StatusBadge
            label={status.label}
            color={status.color}
            pulse={status.pulse}
          />
          <div className="hidden min-w-[160px] max-w-[240px] flex-1 items-center gap-2 sm:flex">
            <ProgressBar value={stats.progress} className="flex-1" />
            <span className="text-xs tabular-nums text-ink-4">
              {stats.done}/{stats.total}
            </span>
          </div>
          {stats.activeAgents > 0 && (
            <span className="hidden items-center gap-1.5 text-xs text-ink-3 md:inline-flex">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-primary" />
              {stats.activeAgents}{" "}
              {stats.activeAgents === 1 ? "agente" : "agentes"}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {project.status === "draft" && (
            <Button
              variant="primary"
              onClick={onStart}
              loading={busy === "plan"}
              size="sm"
            >
              Planificar
            </Button>
          )}
          {project.status === "ready" && (
            <Button
              variant="primary"
              onClick={onStart}
              loading={busy === "start"}
              size="sm"
            >
              Ejecutar
            </Button>
          )}
          {project.status === "running" && (
            <Button
              onClick={onPause}
              loading={busy === "pause" || pauseRequested}
              size="sm"
              title="La pausa es cooperativa: se aplica tras el lote en curso."
            >
              {pauseRequested ? "Pausando tras este lote…" : "Pausar"}
            </Button>
          )}
          {project.status === "paused" && (
            <Button
              variant="primary"
              onClick={onResume}
              loading={busy === "resume"}
              size="sm"
            >
              Reanudar
            </Button>
          )}
          {(project.status === "running" || project.status === "paused") && (
            <Button
              variant="danger"
              onClick={onCancel}
              loading={busy === "cancel"}
              size="sm"
            >
              Cancelar
            </Button>
          )}

          <Link
            href="/activity"
            aria-label="Actividad"
            title="Actividad"
            className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-btn text-ink-3 hover:bg-muted hover:text-ink"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M2 8h2l1.5-4 3 8L10 8h4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
          <Button
            variant="ghost"
            aria-label="Borrar proyecto"
            title="Borrar proyecto"
            onClick={onDelete}
            loading={busy === "delete"}
            size="sm"
            className="text-ink-3 hover:text-danger"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M3 4h10M6.5 4V3h3v1M5 4l.5 8.5h5L11 4"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Button>
        </div>
      </div>

      {actionError && (
        <div className="mx-auto mb-3 max-w-[1060px] rounded-btn border border-danger bg-danger-soft px-4 py-2 text-sm text-danger-text">
          {actionError}
        </div>
      )}
    </div>
  );
}
