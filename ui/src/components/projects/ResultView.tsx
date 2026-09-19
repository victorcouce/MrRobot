"use client";

import { useState } from "react";
import type { Project, StoredReview, SupervisorRun } from "../../lib/types";
import { formatDuration, shortSha } from "../../lib/format";
import { Block } from "../ui/Block";
import { Chip, Pill } from "../ui/Chip";
import { Button } from "../ui/Button";
import { CheckIcon, CopyIcon, PlayIcon } from "../ui/icons";

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="flex flex-col gap-1 border-l border-line px-[18px] py-4 first:border-l-0">
      <span className="text-[12px] text-ink-4">{label}</span>
      <span
        className="text-[22px] font-medium tracking-[-0.01em] text-ink"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

function CopyCommand({ branch }: { branch: string }) {
  const [copied, setCopied] = useState(false);
  const command = `git merge ${branch}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)_auto] items-center gap-3 border-t border-line-soft px-[18px] py-2.5 text-[13.5px]">
      <span className="text-[13px] text-ink-4">Rama</span>
      <span className="truncate font-mono text-[12.5px] text-ink">
        {branch}
      </span>
      <button
        type="button"
        onClick={() => void copy()}
        className="focus-ring inline-flex h-[30px] items-center gap-1.5 rounded-btn px-2 text-[13px] font-medium text-ink-2 hover:bg-muted"
      >
        <CopyIcon size={14} />
        {copied ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}

function FailedResult({
  project,
  onRetryPlan,
  onDelete,
}: {
  project: Project;
  onRetryPlan?: () => void;
  onDelete?: () => void;
}) {
  const { stats } = project;
  const blocked = stats.blocked;

  return (
    <Block aria-label="Resultado">
      <div className="flex items-center justify-between gap-5 px-[22px] py-5">
        <div className="flex flex-col gap-1.5">
          <h2 className="font-display text-[30px] font-normal leading-[1.1] tracking-[-0.01em] text-ink">
            El proyecto no pudo terminar.
          </h2>
          <span className="text-[13.5px] text-ink-3">
            Las tareas hechas se conservan. No se ha creado rama final.
          </span>
        </div>
        <div className="flex shrink-0 gap-[18px] text-[13px]">
          <div className="flex flex-col gap-0.5">
            <span className="text-[22px] font-medium text-ink">
              {stats.done}
            </span>
            <span className="text-ink-4">hechas</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[22px] font-medium text-danger">
              {stats.failed}
            </span>
            <span className="text-ink-4">fallida{stats.failed === 1 ? "" : "s"}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[22px] font-medium text-warning-text">
              {blocked}
            </span>
            <span className="text-ink-4">bloqueada{blocked === 1 ? "" : "s"}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-line bg-subtle px-[18px] py-2.5 pr-3.5">
        <span className="text-[12.5px] text-ink-4">
          Escribe abajo qué cambiar y el proyecto vuelve a Listo.
        </span>
        <div className="flex shrink-0 gap-1.5">
          {onRetryPlan && (
            <Button variant="secondary" size="sm" onClick={onRetryPlan}>
              Regenerar plan
            </Button>
          )}
          {onDelete && (
            <Button variant="secondary" size="sm" onClick={onDelete}>
              Borrar proyecto…
            </Button>
          )}
        </div>
      </div>
    </Block>
  );
}

export function ResultView({
  project,
  reviews = [],
  runs = [],
  onRetryPlan,
  onDelete,
}: {
  project: Project;
  reviews?: StoredReview[];
  runs?: SupervisorRun[];
  onRetryPlan?: () => void;
  onDelete?: () => void;
}) {
  if (project.status === "failed") {
    return (
      <FailedResult
        project={project}
        onRetryPlan={onRetryPlan}
        onDelete={onDelete}
      />
    );
  }

  const { stats, agentsUsed } = project;
  const duration =
    project.startedAt && project.finishedAt
      ? formatDuration(project.startedAt, project.finishedAt)
      : undefined;

  const failedReviews = reviews.filter((review) => !review.approved).length;
  const rounds = runs.length > 0 ? runs.length : 1;

  return (
    <Block aria-label="Resultado del proyecto">
      <div className="flex items-start justify-between gap-4 px-[22px] pt-[22px] pb-[18px]">
        <div className="flex flex-col gap-1.5">
          <Pill className="w-fit bg-success-soft text-success-text">
            <CheckIcon size={11} strokeWidth={3} />
            Completado
          </Pill>
          <h2 className="font-display text-[34px] font-normal leading-[1.1] tracking-[-0.01em] text-ink">
            Tu proyecto está en su propia rama.
          </h2>
          <span className="text-[13.5px] text-ink-3">
            Nada se ha fusionado con{" "}
            <span className="font-mono text-[12.5px]">main</span>. Tú decides
            cuándo integrarla.
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 border-t border-line md:grid-cols-4">
        <Stat label="Tareas" value={`${stats.done} / ${stats.total}`} />
        {duration && <Stat label="Duración" value={duration} />}
        <Stat label="Rondas" value={String(rounds)} />
        <Stat
          label="Reviews fallidos"
          value={String(failedReviews)}
          accent={failedReviews > 0 ? "#B42318" : undefined}
        />
      </div>

      {project.resultBranch && <CopyCommand branch={project.resultBranch} />}

      {project.resultCommit && (
        <div className="grid grid-cols-[120px_minmax(0,1fr)_auto] items-center gap-3 border-t border-line-soft px-[18px] py-2.5 text-[13.5px]">
          <span className="text-[13px] text-ink-4">Commit</span>
          <span className="font-mono text-[12.5px] text-ink">
            {shortSha(project.resultCommit)}
          </span>
          <span />
        </div>
      )}

      {agentsUsed.length > 0 && (
        <div className="grid grid-cols-[120px_minmax(0,1fr)_auto] items-center gap-3 border-t border-line-soft px-[18px] py-3 text-[13.5px]">
          <span className="text-[13px] text-ink-4">Agentes</span>
          <span className="flex flex-wrap gap-1.5">
            {agentsUsed.map((usage) => (
              <Chip key={`${usage.provider}:${usage.model ?? ""}`} mono>
                {usage.label} ×{usage.tasks}
              </Chip>
            ))}
          </span>
          <span />
        </div>
      )}

      {project.resultBranch && (
        <div className="flex items-center justify-between gap-4 border-t border-line bg-subtle px-[18px] py-2.5 pr-3.5">
          <span className="truncate font-mono text-[12px] text-ink-4">
            git merge {project.resultBranch}
          </span>
          <div className="flex shrink-0 gap-1.5">
            <Button variant="ghost" size="sm">
              <PlayIcon />
              Abrir preview
            </Button>
          </div>
        </div>
      )}
    </Block>
  );
}
