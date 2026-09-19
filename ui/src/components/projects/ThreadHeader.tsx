"use client";

import Link from "next/link";
import type { Project } from "../../lib/types";
import { PROJECT_STATUS } from "../../lib/status";
import { Button } from "../ui/Button";
import { Pill } from "../ui/Chip";
import {
  ActivityIcon,
  PauseIcon,
  PlayIcon,
  SettingsIcon,
} from "../ui/icons";

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

const PILL_CLASSES: Record<string, string> = {
  draft: "bg-muted text-ink-3",
  planning: "bg-warning-soft text-warning-text",
  ready: "bg-primary-soft text-primary-soft-text",
  running: "bg-primary-soft text-primary-soft-text",
  paused: "bg-warning-soft text-warning-text",
  blocked: "bg-warning-soft text-warning-text",
  completed: "bg-success-soft text-success-text",
  failed: "bg-danger-soft text-danger-text",
  cancelled: "bg-muted text-ink-3",
};

const DOT_CLASSES: Record<string, string> = {
  draft: "bg-neutral-dot",
  planning: "bg-warning",
  ready: "bg-primary",
  running: "bg-primary",
  paused: "bg-warning",
  blocked: "bg-warning",
  completed: "bg-success",
  failed: "bg-danger",
  cancelled: "bg-neutral-dot",
};

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
  const meta = [project.repoPath, project.baseRef]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="shrink-0 border-b border-line bg-surface px-[28px] pr-5">
      <div className="flex h-14 items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.5 text-[13.5px]">
          <span className="truncate text-ink-4">{project.name}</span>
          <span className="text-line-strong">/</span>
          <span className="truncate font-semibold text-ink">
            {chatName ?? "Chat"}
          </span>
          <Pill className={PILL_CLASSES[project.status]}>
            <span
              className={
                status.pulse
                  ? `pulse-dot h-1.5 w-1.5 rounded-full ${DOT_CLASSES[project.status]}`
                  : `h-1.5 w-1.5 rounded-full ${DOT_CLASSES[project.status]}`
              }
            />
            {status.label}
          </Pill>
          {meta && (
            <span className="hidden truncate font-mono text-[12px] text-ink-4 lg:inline">
              {meta}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Link
            href="/activity"
            className="focus-ring inline-flex h-[34px] items-center gap-2 rounded-btn px-3 text-[13px] font-medium text-ink-3 transition-colors hover:bg-muted hover:text-ink"
          >
            <ActivityIcon size={15} />
            Actividad
          </Link>
          <Link
            href="/settings"
            className="focus-ring inline-flex h-[34px] items-center gap-2 rounded-btn px-3 text-[13px] font-medium text-ink-3 transition-colors hover:bg-muted hover:text-ink"
          >
            <SettingsIcon size={15} />
            Ajustes
          </Link>

          {project.status === "draft" && onStart && (
            <Button
              variant="primary"
              size="sm"
              className="ml-1.5"
              onClick={onStart}
              loading={busy === "plan"}
            >
              Planificar
            </Button>
          )}
          {project.status === "ready" && (
            <Button
              variant="primary"
              size="sm"
              className="ml-1.5"
              onClick={onStart}
              loading={busy === "start"}
            >
              <PlayIcon />
              Ejecutar
            </Button>
          )}
          {project.status === "running" && (
            <>
              <Button
                size="sm"
                className="ml-1.5"
                onClick={onPause}
                loading={busy === "pause" || pauseRequested}
                title="La pausa es cooperativa: se aplica tras el lote en curso."
              >
                <PauseIcon />
                {pauseRequested ? "Pausando…" : "Pausar"}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={onCancel}
                loading={busy === "cancel"}
              >
                Cancelar
              </Button>
            </>
          )}
          {project.status === "paused" && (
            <>
              <Button
                variant="primary"
                size="sm"
                className="ml-1.5"
                onClick={onResume}
                loading={busy === "resume"}
              >
                <PlayIcon />
                Reanudar
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={onCancel}
                loading={busy === "cancel"}
              >
                Cancelar
              </Button>
            </>
          )}

          {onDelete && (
            <button
              type="button"
              aria-label="Borrar proyecto"
              title="Borrar proyecto"
              onClick={onDelete}
              className="focus-ring ml-1 inline-flex h-8 w-8 items-center justify-center rounded-btn text-ink-4 transition-colors hover:bg-muted hover:text-danger"
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
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="mb-3 rounded-btn border border-danger bg-danger-soft px-4 py-2 text-sm text-danger-text">
          {actionError}
        </div>
      )}
    </div>
  );
}
