"use client";

import type { Project } from "../../lib/types";
import { Block } from "../ui/Block";
import { Button } from "../ui/Button";

interface PauseStateBlockProps {
  project: Project;
  onResume?: () => void;
  onCancel?: () => void;
}

export function PauseStateBlock({
  project,
  onResume,
  onCancel,
}: PauseStateBlockProps) {
  if (project.status !== "paused") {
    return null;
  }

  const stats = project.stats;
  const completed = stats?.done ?? 0;
  const total = stats?.total ?? 0;

  return (
    <Block>
      <div className="flex gap-4 items-center p-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            className="text-ink-2"
            aria-hidden="true"
          >
            <path d="M9 5v14M15 5v14"></path>
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-ink">
            En pausa · {completed} de {total} hechas
          </div>
          <p className="text-sm text-ink-3 mt-1">
            El lote en curso terminó. Puedes escribir, ajustar el plan o los agentes del chat.
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          {onCancel && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onCancel}
              className="text-danger hover:text-danger"
            >
              Cancelar
            </Button>
          )}
          {onResume && (
            <Button size="sm" variant="primary" onClick={onResume}>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M7 4.5v15l12.5-7.5z"></path>
              </svg>
              Reanudar
            </Button>
          )}
        </div>
      </div>
    </Block>
  );
}
