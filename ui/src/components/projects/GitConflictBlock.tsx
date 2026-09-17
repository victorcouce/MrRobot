"use client";

import type { Task } from "../../lib/types";
import { Block } from "../ui/Block";
import { Button } from "../ui/Button";

interface GitConflictBlockProps {
  task: Task;
  onRequestReplan?: () => void;
}

export function GitConflictBlock({
  task,
  onRequestReplan,
}: GitConflictBlockProps) {
  if (!task.integrationError || task.integrationError.type !== "git_conflict") {
    return null;
  }

  const files = task.integrationError.files || [];

  return (
    <Block>
      <div className="flex gap-3 p-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-warning-soft">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            className="text-warning-text"
            aria-hidden="true"
          >
            <circle cx="6" cy="5" r="2"></circle>
            <circle cx="6" cy="19" r="2"></circle>
            <circle cx="18" cy="6" r="2"></circle>
            <path d="M6 7v10M18 8c0 5-5 5-10 9"></path>
          </svg>
        </div>

        <div className="flex-1 space-y-2">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-ink">
                Conflicto de integración
              </div>
              <div className="text-xs text-ink-4 font-mono">{task.id}</div>
            </div>
            <div className="shrink-0 rounded-full bg-warning-soft px-2 py-1 text-xs font-medium text-warning-text">
              Bloqueada
            </div>
          </div>

          <p className="text-sm text-ink-2 leading-relaxed">
            {task.integrationError.message ||
              "El cherry-pick de dependencias choca. Tu repositorio principal está intacto."}
          </p>

          {files.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {files.map((file) => (
                <span
                  key={file}
                  className="inline-flex items-center rounded-chip bg-muted px-2.5 py-1 font-mono text-xs text-ink-2"
                >
                  {file}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-line-soft bg-subtle px-4 py-3 flex items-center justify-between">
        <span className="text-xs text-ink-4">Esperando al supervisor</span>
        {onRequestReplan && (
          <Button size="sm" variant="primary" onClick={onRequestReplan}>
            Pedir replan
          </Button>
        )}
      </div>
    </Block>
  );
}
