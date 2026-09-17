"use client";

import type { Project } from "../../lib/types";
import { PROJECT_STATUS } from "../../lib/status";
import { Button } from "../ui/Button";
import { StatusBadge, LoadingState } from "../ui/Badge";
import { ProgressBar } from "../ui/Progress";

interface ThreadHeaderProps {
  project: Project;
  chatName?: string;
  onSettings?: () => void;
  onStart?: (() => void) | (() => Promise<void>);
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
  onActivityClick?: () => void;
  busy?: string | null;
  pauseRequested?: boolean;
  actionError?: string | null;
  canEditConfig?: boolean;
}

export function ThreadHeader({
  project,
  chatName,
  onSettings,
  onStart,
  onPause,
  onResume,
  onCancel,
  onDelete,
  onActivityClick,
  busy,
  pauseRequested,
  actionError,
  canEditConfig,
}: ThreadHeaderProps) {
  const status = PROJECT_STATUS[project.status];
  const { stats } = project;

  return (
    <div className="border-b border-line bg-surface px-4 py-4 shadow-sm sm:px-6">
      <div className="mx-auto flex max-w-[820px] flex-wrap items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight text-ink">
              {project.name}
              {chatName && <span className="text-ink-3"> / {chatName}</span>}
            </h1>
            <StatusBadge
              label={status.label}
              color={status.color}
              pulse={status.pulse}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex min-w-[200px] flex-1 items-center gap-3">
              <ProgressBar value={stats.progress} className="flex-1" />
              <span className="text-xs font-medium tabular-nums text-ink-3">
                {stats.done} / {stats.total}
              </span>
            </div>
            {stats.activeAgents > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs text-ink-3">
                <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-blue-500" />
                {stats.activeAgents} agent{stats.activeAgents === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          {canEditConfig && (
            <Button onClick={onSettings} size="sm">
              Settings
            </Button>
          )}
          {project.status === "draft" && (
            <Button
              variant="primary"
              onClick={onStart}
              loading={busy === "plan"}
              size="sm"
            >
              Plan
            </Button>
          )}
          {project.status === "ready" && (
            <Button
              variant="primary"
              onClick={onStart}
              loading={busy === "start"}
              size="sm"
            >
              Run
            </Button>
          )}
          {project.status === "running" && (
            <Button
              onClick={onPause}
              loading={busy === "pause" || pauseRequested}
              size="sm"
            >
              {pauseRequested ? "Pausing…" : "Pause"}
            </Button>
          )}
          {project.status === "paused" && (
            <Button
              variant="primary"
              onClick={onResume}
              loading={busy === "resume"}
              size="sm"
            >
              Resume
            </Button>
          )}
          {(project.status === "running" || project.status === "paused") && (
            <Button
              variant="danger"
              onClick={onCancel}
              loading={busy === "cancel"}
              size="sm"
            >
              Cancel
            </Button>
          )}
          <Button
            variant="ghost"
            aria-label="Activity"
            title="Activity"
            onClick={onActivityClick}
            size="sm"
            className="text-ink-3 hover:text-ink"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2 2h12M2 7h12M2 12h12"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          </Button>
          <Button
            variant="ghost"
            aria-label="Delete"
            title="Delete"
            onClick={onDelete}
            loading={busy === "delete"}
            size="sm"
            className="text-ink-3 hover:text-red-600"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
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
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {actionError}
        </div>
      )}
    </div>
  );
}
