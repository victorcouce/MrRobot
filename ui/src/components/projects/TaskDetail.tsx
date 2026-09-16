"use client";

import type { StoredReview, Task } from "../../lib/types";
import {
  COMPLEXITY_LABELS,
  TASK_STATUS,
  TASK_TYPE_LABELS,
} from "../../lib/status";
import { agentLabel } from "../../lib/api";
import { shortSha } from "../../lib/format";
import { StatusBadge } from "../ui/Badge";
import { Button } from "../ui/Button";

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-xs uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        {label}
      </dt>
      <dd className="text-right text-sm text-zinc-700 dark:text-zinc-300">
        {children}
      </dd>
    </div>
  );
}

export function TaskDetail({
  task,
  reviews,
  onClose,
  editable,
  onEdit,
  onDelete,
}: {
  task: Task;
  reviews: StoredReview[];
  onClose: () => void;
  editable?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const status = TASK_STATUS[task.status];
  const taskReviews = reviews.filter((review) => review.taskId === task.id);
  const lastReview = taskReviews[taskReviews.length - 1];
  const attempts = task.attempts ?? [];
  const lastSuccess = [...attempts].reverse().find((attempt) => attempt.status === "success");

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <div className="min-w-0">
          <div className="font-mono text-xs text-zinc-400">{task.id}</div>
          <h2 className="truncate text-base font-semibold">{task.title}</h2>
        </div>
        <div className="flex items-center gap-2">
          {editable && onEdit && (
            <Button size="sm" onClick={onEdit}>
              Edit
            </Button>
          )}
          {editable && onDelete && (
            <Button size="sm" variant="danger" onClick={onDelete}>
              Delete
            </Button>
          )}
          <button
            onClick={onClose}
            className="focus-ring rounded p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            aria-label="Cerrar"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <dl className="mb-5 divide-y divide-zinc-100 dark:divide-zinc-800">
          <DetailRow label="Status">
            <StatusBadge label={status.label} color={status.color} pulse={status.pulse} />
          </DetailRow>
          <DetailRow label="Type">{TASK_TYPE_LABELS[task.type] ?? task.type}</DetailRow>
          <DetailRow label="Complexity">{COMPLEXITY_LABELS[task.complexity] ?? task.complexity}</DetailRow>
          <DetailRow label="Selected agent">{agentLabel(task.agent)}</DetailRow>
          <DetailRow label="Dependencies">
            {task.dependsOn && task.dependsOn.length > 0 ? (
              <span className="font-mono text-xs">{task.dependsOn.join(", ")}</span>
            ) : (
              "—"
            )}
          </DetailRow>
        </dl>

        <section className="mb-5">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Description
          </h3>
          <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            {task.description}
          </p>
        </section>

        {task.acceptanceCriteria && task.acceptanceCriteria.length > 0 && (
          <section className="mb-5">
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Acceptance criteria
            </h3>
            <ul className="space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
              {task.acceptanceCriteria.map((criterion, index) => (
                <li key={index} className="flex gap-2">
                  <span className="text-zinc-400">·</span>
                  <span>{criterion}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {task.error && (
          <section className="mb-5">
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-red-500">
              Error
            </h3>
            <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
              {task.error}
            </p>
          </section>
        )}

        {attempts.length > 0 && (
          <section className="mb-5">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Attempts
            </h3>
            <ol className="space-y-0">
              {attempts.map((attempt, index) => (
                <li key={index}>
                  {index > 0 && (
                    <div className="ml-3 flex items-center gap-1 py-0.5 text-[11px] text-zinc-400">
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <path d="M8 3v10m0 0l-3.5-3.5M8 13l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      fallback
                    </div>
                  )}
                  <div className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-400">#{attempt.attempt}</span>
                      <span className="text-sm font-medium">{agentLabel(attempt.agent)}</span>
                    </div>
                    <div className="text-right">
                      <span
                        className={
                          attempt.status === "success"
                            ? "text-xs font-medium text-emerald-600 dark:text-emerald-400"
                            : "text-xs font-medium text-red-600 dark:text-red-400"
                        }
                      >
                        {attempt.status === "success" ? "SUCCESS" : "FAILED"}
                      </span>
                      {attempt.error && (
                        <div className="max-w-[180px] truncate text-xs text-zinc-400">
                          {attempt.error}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {lastReview && (
          <section className="mb-5">
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Review
            </h3>
            <div
              className={
                lastReview.approved
                  ? "rounded-md bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                  : "rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300"
              }
            >
              <div className="mb-1 font-medium">
                {lastReview.approved ? "Approved" : "Failed"}
              </div>
              <p className="text-xs opacity-90">{lastReview.summary}</p>
              {lastReview.issues.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs">
                  {lastReview.issues.map((issue, index) => (
                    <li key={index}>· {issue.description}</li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {(lastSuccess || task.resultCommit) && (
          <section>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Git
            </h3>
            <dl className="space-y-1 text-sm">
              {lastSuccess?.branchName && (
                <DetailRow label="Branch">
                  <span className="font-mono text-xs">{lastSuccess.branchName}</span>
                </DetailRow>
              )}
              <DetailRow label="Commit">
                <span className="font-mono text-xs">
                  {shortSha(task.resultCommit ?? lastSuccess?.commitSha)}
                </span>
              </DetailRow>
            </dl>
          </section>
        )}
      </div>
    </div>
  );
}
