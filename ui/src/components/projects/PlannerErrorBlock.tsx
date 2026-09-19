"use client";

import { Block } from "../ui/Block";
import { Button } from "../ui/Button";
import { AlertIcon } from "../ui/icons";

interface PlannerErrorBlockProps {
  error: string;
  onRetry?: () => void;
  onReformulate?: () => void;
}

export function PlannerErrorBlock({
  error,
  onRetry,
  onReformulate,
}: PlannerErrorBlockProps) {
  return (
    <Block className="shadow-none" aria-label="Error del planner">
      <div className="flex items-start gap-3 px-[18px] py-4">
        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] bg-danger-soft text-danger">
          <AlertIcon />
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-[13.5px] font-semibold text-ink">
            No pude generar el plan
          </span>

          <p className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-ink-2">
            {error}
          </p>

          <div className="flex gap-1.5 pt-1">
            {onRetry && (
              <Button size="sm" variant="secondary" onClick={onRetry}>
                Reintentar
              </Button>
            )}
            {onReformulate && (
              <Button size="sm" variant="ghost" onClick={onReformulate}>
                Reformular mensaje
              </Button>
            )}
          </div>
        </div>
      </div>
    </Block>
  );
}
