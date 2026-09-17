"use client";

import { Block } from "../ui/Block";
import { Button } from "../ui/Button";

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
    <Block>
      <div className="flex gap-3 p-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-danger-soft">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            className="text-danger-text"
            aria-hidden="true"
          >
            <path d="M12 7v6M12 17h.01"></path>
          </svg>
        </div>

        <div className="flex-1 space-y-3">
          <h3 className="text-sm font-semibold text-ink">No pude generar el plan</h3>

          <p className="font-mono text-xs text-ink-2 leading-relaxed whitespace-pre-wrap break-words">
            {error}
          </p>

          <div className="flex gap-2 pt-2">
            {onRetry && (
              <Button size="sm" variant="primary" onClick={onRetry}>
                Reintentar
              </Button>
            )}
            {onReformulate && (
              <Button size="sm" variant="secondary" onClick={onReformulate}>
                Reformular mensaje
              </Button>
            )}
          </div>
        </div>
      </div>
    </Block>
  );
}
