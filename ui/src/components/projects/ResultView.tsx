import type { Project } from "../../lib/types";
import { formatDuration, shortSha } from "../../lib/format";
import { agentLabel } from "../../lib/api";

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
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-xs uppercase tracking-wide text-zinc-400">{label}</div>
      <div
        className={
          mono
            ? "mt-1 break-all font-mono text-sm text-zinc-800 dark:text-zinc-100"
            : "mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100"
        }
      >
        {value}
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
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Tasks completed" value={`${stats.done} / ${stats.total}`} />
        {duration && <Stat label="Duration" value={duration} />}
        {project.resultBranch && (
          <Stat label="Final branch" value={project.resultBranch} mono />
        )}
        {project.resultCommit && (
          <Stat label="Final commit" value={shortSha(project.resultCommit)} mono />
        )}
      </div>

      {project.resultBranch && project.resultCommit && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            El trabajo está en una <strong>branch aislada</strong>. No se ha
            integrado automáticamente a <code className="font-mono">main</code>.
          </p>
        </div>
      )}

      {agentsUsed.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Agents used
          </h3>
          <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
            {agentsUsed.map((usage) => (
              <div
                key={`${usage.provider}:${usage.model ?? ""}`}
                className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5 text-sm last:border-0 dark:border-zinc-800"
              >
                <span className="text-zinc-700 dark:text-zinc-300">
                  {usage.label}
                </span>
                <span className="tabular-nums text-zinc-500">
                  {usage.tasks} task{usage.tasks === 1 ? "" : "s"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {(failedTasks.length > 0 || blockedTasks.length > 0) && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Issues
          </h3>
          <ul className="space-y-2">
            {failedTasks.map((task) => (
              <li
                key={task.id}
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
              >
                <span className="font-mono text-xs">{task.id}</span> · {task.title}
                {task.error ? ` — ${task.error}` : ""}
              </li>
            ))}
            {blockedTasks.map((task) => (
              <li
                key={task.id}
                className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-700 dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-300"
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
