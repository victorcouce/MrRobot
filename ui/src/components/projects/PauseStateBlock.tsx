"use client";

import type { Project } from "../../lib/types";
import { Block } from "../ui/Block";
import { Button } from "../ui/Button";
import { PauseIcon, PlayIcon } from "../ui/icons";

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

  const completed = project.stats?.done ?? 0;
  const total = project.stats?.total ?? 0;

  return (
    <Block aria-label="Proyecto en pausa">
      <div className="flex items-center gap-3 px-[18px] py-4">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-muted text-ink-2">
          <PauseIcon />
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-semibold text-ink">
            En pausa · {completed} de {total} hechas
          </span>
          <span className="text-[13px] text-ink-3">
            El lote en curso terminó. Puedes escribir, ajustar el plan o los
            agentes del chat.
          </span>
        </div>

        <div className="flex shrink-0 gap-1.5">
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
              <PlayIcon />
              Reanudar
            </Button>
          )}
        </div>
      </div>
    </Block>
  );
}
