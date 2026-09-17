"use client";

import { useState } from "react";
import type { Project } from "../../lib/types";
import { formatDuration, shortSha } from "../../lib/format";
import { clsx } from "../../lib/cx";

function Stat({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-chip border border-line bg-subtle px-3 py-2.5">
      <div className="text-xs text-ink-4">{label}</div>
      <div
        className={clsx(
          "mt-1",
          mono
            ? "break-all font-mono text-sm text-ink-2"
            : "text-lg font-semibold text-ink",
        )}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * MrRobot nunca integra: el resultado se queda en su rama y aquí se ofrece el
 * comando de merge para que lo haga quien corresponda.
 */
function MergeCommand({ branch }: { branch: string }) {
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
    <div className="rounded-chip border border-line bg-subtle p-3">
      <p className="text-sm text-ink-3">
        El trabajo está en una rama aparte. MrRobot no hace merge: cuando lo
        revises, intégralo tú.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <code className="flex-1 truncate rounded-chip bg-surface px-3 py-2 font-mono text-xs text-ink-2">
          {command}
        </code>
        <button
          type="button"
          onClick={() => void copy()}
          className="focus-ring shrink-0 rounded-btn border border-line-strong bg-surface px-3 py-2 text-xs font-medium text-ink-2 hover:bg-muted"
        >
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  );
}

export function ResultView({ project }: { project: Project }) {
  const { stats, agentsUsed } = project;
  const duration =
    project.startedAt && project.finishedAt
      ? formatDuration(project.startedAt, project.finishedAt)
      : undefined;

  const failedTasks = project.tasks.filter((task) => task.status === "failed");
  const blockedTasks = project.tasks.filter((task) => task.status === "blocked");

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Tareas hechas" value={`${stats.done} / ${stats.total}`} />
        {duration && <Stat label="Duración" value={duration} />}
        {project.resultBranch && (
          <Stat label="Rama final" value={project.resultBranch} mono />
        )}
        {project.resultCommit && (
          <Stat label="Commit final" value={shortSha(project.resultCommit)} mono />
        )}
        {project.repoPath && <Stat label="Carpeta" value={project.repoPath} mono />}
        {project.remoteUrl && (
          <Stat label="Remoto" value={project.remoteUrl} mono />
        )}
      </div>

      {project.resultBranch && <MergeCommand branch={project.resultBranch} />}

      {agentsUsed.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold text-ink-4">
            Agentes que trabajaron
          </h3>
          <div className="overflow-hidden rounded-chip border border-line">
            {agentsUsed.map((usage) => (
              <div
                key={`${usage.provider}:${usage.model ?? ""}`}
                className="flex items-center justify-between border-b border-line-soft px-3 py-2 text-sm last:border-0"
              >
                <span className="font-mono text-ink-2">{usage.label}</span>
                <span className="tabular-nums text-ink-4">
                  {usage.tasks} {usage.tasks === 1 ? "tarea" : "tareas"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {(failedTasks.length > 0 || blockedTasks.length > 0) && (
        <section>
          <h3 className="mb-2 text-xs font-semibold text-ink-4">Sin terminar</h3>
          <ul className="space-y-2">
            {failedTasks.map((task) => (
              <li
                key={task.id}
                className="rounded-chip border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger-text"
              >
                <span className="font-mono text-xs">{task.id}</span> · {task.title}
                {task.error ? ` — ${task.error}` : ""}
              </li>
            ))}
            {blockedTasks.map((task) => (
              <li
                key={task.id}
                className="rounded-chip border border-warning-soft bg-warning-soft px-3 py-2 text-sm text-warning-text"
              >
                <span className="font-mono text-xs">{task.id}</span> · {task.title}
                {task.blockedReason ? ` — ${task.blockedReason}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
