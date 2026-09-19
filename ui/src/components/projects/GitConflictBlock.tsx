"use client";

import type { Task } from "../../lib/types";
import { Block, BlockFooter } from "../ui/Block";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { GitConflictIcon } from "../ui/icons";

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
    <Block aria-label="Conflicto de integración">
      <div className="flex items-start gap-3 px-[18px] py-4">
        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] bg-warning-soft text-warning-text">
          <GitConflictIcon />
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-start justify-between gap-4 text-[13.5px]">
            <span>
              <span className="font-semibold">Conflicto de integración</span> ·{" "}
              <span className="font-mono text-[12.5px]">{task.id}</span>{" "}
              bloqueada
            </span>
            <span className="shrink-0 font-mono text-[11.5px] text-ink-4">
              git.conflict
            </span>
          </div>

          <span className="text-[13.5px] leading-relaxed text-ink-2">
            {task.integrationError.message ||
              "El cherry-pick de dependencias choca. Tu repositorio principal está intacto."}
          </span>

          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {files.map((file) => (
                <Chip key={file} mono>
                  {file}
                </Chip>
              ))}
            </div>
          )}
        </div>
      </div>

      <BlockFooter>
        <span className="text-[12.5px] text-ink-4">Esperando al supervisor</span>
        {onRequestReplan && (
          <Button size="sm" variant="secondary" onClick={onRequestReplan}>
            Pedir replan
          </Button>
        )}
      </BlockFooter>
    </Block>
  );
}
