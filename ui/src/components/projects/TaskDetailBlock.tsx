"use client";

import type { StoredReview, Task } from "../../lib/types";
import {
  COMPLEXITY_LABELS,
  TASK_TYPE_LABELS,
} from "../../lib/status";
import { agentLabel } from "../../lib/api";
import { shortSha } from "../../lib/format";
import {
  Block,
  BlockContent,
  BlockFooter,
  BlockHeader,
  BlockKV,
  StatusPill,
} from "../ui/Block";
import { Button } from "../ui/Button";
import { clsx } from "../../lib/cx";

interface TaskDetailBlockProps {
  task: Task;
  reviews: StoredReview[];
  onEdit?: () => void;
  onDelete?: () => void;
}

function AttemptDot({ status }: { status: "success" | "failed" }) {
  return (
    <div
      className={clsx(
        "h-1.5 w-1.5 rounded-full flex-shrink-0",
        status === "success" ? "bg-success" : "bg-danger",
      )}
    />
  );
}

export function TaskDetailBlock({
  task,
  reviews,
  onEdit,
  onDelete,
}: TaskDetailBlockProps) {
  const taskReviews = reviews.filter((review) => review.taskId === task.id);
  const lastReview = taskReviews[taskReviews.length - 1];
  const attempts = task.attempts ?? [];
  const lastSuccess = [...attempts].reverse().find((attempt) => attempt.status === "success");

  return (
    <Block>
      <BlockHeader
        title={
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-ink-4">{task.id}</span>
            <span>{task.title}</span>
          </div>
        }
        actions={
          <div className="flex gap-2">
            {task.status === "done" && <StatusPill status="done" />}
            {task.status === "failed" && <StatusPill status="failed" />}
            {task.status === "blocked" && <StatusPill status="blocked" />}
            {task.status === "running" && <StatusPill status="running" />}
          </div>
        }
      />

      <BlockContent>
        <div className="divide-y divide-line-soft space-y-0">
          <BlockKV label="Tipo · complejidad">
            {TASK_TYPE_LABELS[task.type] ?? task.type} · {" "}
            {COMPLEXITY_LABELS[task.complexity] ?? task.complexity}
          </BlockKV>

          {task.acceptanceCriteria && task.acceptanceCriteria.length > 0 && (
            <BlockKV label="Criterios">
              <div className="space-y-1 text-sm">
                {task.acceptanceCriteria.map((criterion, index) => (
                  <div key={index} className="flex gap-2">
                    <span className="text-ink-4 flex-shrink-0">·</span>
                    <span>{criterion}</span>
                  </div>
                ))}
              </div>
            </BlockKV>
          )}

          {(lastSuccess?.commitSha || task.resultCommit) && (
            <BlockKV label="Resultado">
              <div className="font-mono text-xs space-y-0.5">
                <div>
                  {shortSha(task.resultCommit ?? lastSuccess?.commitSha)}
                </div>
                {lastSuccess?.branchName && (
                  <div className="text-ink-4">{lastSuccess.branchName}</div>
                )}
              </div>
            </BlockKV>
          )}

          {task.dependsOn && task.dependsOn.length > 0 && (
            <BlockKV label="Depende de">
              <div className="font-mono text-xs space-x-2">
                {task.dependsOn.map((dep) => (
                  <span
                    key={dep}
                    className="inline-block bg-muted px-2 py-1 rounded-chip text-ink-2"
                  >
                    {dep}
                  </span>
                ))}
              </div>
            </BlockKV>
          )}
        </div>

        {attempts.length > 0 && (
          <div className="mt-6 pt-4 border-t border-line-soft">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-4 mb-4">
              Intentos
            </h4>
            <div className="space-y-3">
              {attempts.map((attempt, index) => (
                <div key={index}>
                  {index > 0 && (
                    <div className="mb-2 flex items-center gap-1.5 text-xs text-ink-4">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 16 16"
                        fill="none"
                      >
                        <path
                          d="M8 3v10m0 0l-3.5-3.5M8 13l3.5-3.5"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      fallback
                    </div>
                  )}
                  <div className="flex items-center justify-between rounded-md border border-line bg-white p-3">
                    <div className="flex items-center gap-2">
                      <AttemptDot status={attempt.status} />
                      <span className="text-xs text-ink-4">#{attempt.attempt}</span>
                      <span className="font-mono text-sm font-medium text-ink">
                        {agentLabel(attempt.agent)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span
                        className={clsx(
                          "text-xs font-medium",
                          attempt.status === "success"
                            ? "text-success"
                            : "text-danger",
                        )}
                      >
                        {attempt.status === "success" ? "✓" : "✗"}
                      </span>
                      {attempt.error && (
                        <div className="max-w-[200px] truncate text-xs text-ink-4 mt-1">
                          {attempt.error}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {lastReview && (
          <div className="mt-6 pt-4 border-t border-line-soft">
            <div
              className={clsx(
                "rounded-md p-3 text-sm",
                lastReview.approved
                  ? "bg-success-soft text-success-text"
                  : "bg-danger-soft text-danger-text",
              )}
            >
              <div className="font-medium mb-1">
                {lastReview.approved ? "✓ Aprobada" : "✗ Rechazada"}
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
          </div>
        )}

        {task.error && (
          <div className="mt-6 pt-4 border-t border-line-soft">
            <div className="rounded-md bg-danger-soft p-3 text-sm text-danger-text">
              <div className="font-medium mb-1">Error</div>
              <p className="text-xs">{task.error}</p>
            </div>
          </div>
        )}
      </BlockContent>

      <BlockFooter>
        <span className="text-xs text-ink-4">
          Se abre desde cualquier tarjeta o ID mencionado
        </span>
        <div className="flex gap-2">
          {onEdit && (
            <Button size="sm" variant="ghost" onClick={onEdit}>
              Editar
            </Button>
          )}
          {onDelete && (
            <Button size="sm" variant="ghost" onClick={onDelete}>
              Eliminar
            </Button>
          )}
        </div>
      </BlockFooter>
    </Block>
  );
}
