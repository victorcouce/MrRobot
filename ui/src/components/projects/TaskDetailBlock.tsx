"use client";

import type { StoredReview, Task } from "../../lib/types";
import { COMPLEXITY_LABELS, TASK_TYPE_LABELS } from "../../lib/status";
import { monoAgentLabel } from "../../lib/agents";
import { formatDuration, shortSha } from "../../lib/format";
import {
  Block,
  BlockFooter,
  BlockHeader,
  BlockKV,
  StatusPill,
} from "../ui/Block";
import { Button } from "../ui/Button";
import { WaveDots } from "../ui/WaveDots";
import { clsx } from "../../lib/cx";

interface TaskDetailBlockProps {
  task: Task;
  reviews: StoredReview[];
  onEdit?: () => void;
  onDelete?: () => void;
}

function statusPillFor(task: Task) {
  if (task.status === "done") return <StatusPill status="done" />;
  if (task.status === "failed") return <StatusPill status="failed" />;
  if (task.status === "blocked") return <StatusPill status="blocked" />;
  if (task.status === "running") {
    return (
      <span className="flex items-center gap-2">
        <StatusPill status="running" />
        <WaveDots className="text-primary" label="Tarea en curso" />
      </span>
    );
  }
  return null;
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
  const lastSuccess = [...attempts]
    .reverse()
    .find((attempt) => attempt.status === "success");

  return (
    <Block aria-label="Detalle de tarea">
      <BlockHeader
        title={
          <>
            <span className="font-mono text-[12.5px] font-medium text-ink-4">
              {task.id}
            </span>
            <span className="truncate">{task.title}</span>
          </>
        }
        actions={statusPillFor(task)}
      />

      <div className="px-[18px] pt-2.5 pb-1.5">
        <BlockKV label="Tipo · complejidad">
          {TASK_TYPE_LABELS[task.type] ?? task.type} ·{" "}
          {COMPLEXITY_LABELS[task.complexity] ?? task.complexity}
        </BlockKV>

        {task.acceptanceCriteria && task.acceptanceCriteria.length > 0 && (
          <BlockKV label="Criterios">
            <span className="leading-relaxed">
              {task.acceptanceCriteria.join(" · ")}
            </span>
          </BlockKV>
        )}

        {task.dependsOn && task.dependsOn.length > 0 && (
          <BlockKV label="Depende de">
            <span className="font-mono text-[12px]">
              {task.dependsOn.join(" · ")}
            </span>
          </BlockKV>
        )}

        {(lastSuccess?.commitSha || task.resultCommit) && (
          <BlockKV label="Resultado">
            <span className="font-mono text-[12px]">
              {shortSha(task.resultCommit ?? lastSuccess?.commitSha)}
              {lastSuccess?.branchName ? ` · ${lastSuccess.branchName}` : ""}
            </span>
          </BlockKV>
        )}
      </div>

      {attempts.length > 0 && (
        <div className="border-t border-line-soft px-[18px] pt-1 pb-2.5">
          <div className="py-3 pb-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-4">
            Intentos
          </div>
          {attempts.map((attempt, index) => {
            const start = attempt.startedAt;
            const end = attempt.finishedAt;
            return (
              <div
                key={index}
                className="grid grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-3 py-2.5"
              >
                <span
                  className={clsx(
                    "mt-1.5 h-[7px] w-[7px] rounded-full",
                    attempt.status === "success" ? "bg-success" : "bg-danger",
                  )}
                />
                <span className="flex flex-col gap-0.5 text-[13px]">
                  <span>
                    <span className="font-mono text-[12px]">
                      {monoAgentLabel(attempt.agent)}
                    </span>{" "}
                    · intento {attempt.attempt}
                  </span>
                  {attempt.error && (
                    <span className="text-[12.5px] text-ink-4">
                      {attempt.error}
                    </span>
                  )}
                </span>
                <span className="font-mono text-[11.5px] text-ink-4">
                  {start && end ? formatDuration(start, end) : "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {lastReview && (
        <div
          className={clsx(
            "border-t border-line-soft px-[18px] py-3 text-[13px]",
            lastReview.approved
              ? "bg-success-soft text-success-text"
              : "bg-danger-soft text-danger-text",
          )}
        >
          <div className="font-medium">
            {lastReview.approved ? "✓ Review aprobado" : "✗ Review no aprobado"}
          </div>
          <p className="mt-0.5 opacity-90">{lastReview.summary}</p>
          {lastReview.issues.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {lastReview.issues.map((issue, index) => (
                <li key={index}>· {issue.description}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {(task.status === "failed" || task.status === "blocked") && task.error && (
        <div className="border-t border-line-soft bg-danger-soft px-[18px] py-3 text-[13px] text-danger-text">
          <div className="font-medium">Error</div>
          <p className="mt-0.5">{task.error}</p>
        </div>
      )}

      <BlockFooter>
        <span className="text-[12.5px] text-ink-4">
          Se abre desde cualquier tarjeta o ID mencionado
        </span>
        <div className="flex gap-1">
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
