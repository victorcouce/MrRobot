import Link from "next/link";
import type { ProjectSummary } from "../../lib/types";
import { PROJECT_STATUS } from "../../lib/status";
import { relativeTime } from "../../lib/format";
import { ProgressBar } from "../ui/Progress";
import { StatusBadge } from "../ui/Badge";

export function ProjectCard({ project }: { project: ProjectSummary }) {
  const status = PROJECT_STATUS[project.status];
  const { stats } = project;

  return (
    <Link
      href={`/projects/${project.id}`}
      className="focus-ring group block rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-sm font-semibold text-zinc-900 group-hover:text-accent dark:text-zinc-100">
          {project.name}
        </h3>
        <StatusBadge
          label={status.label}
          color={status.color}
          pulse={status.pulse}
        />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="flex-1">
          <ProgressBar value={stats.progress} />
        </div>
        <span className="text-xs font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
          {stats.progress}%
        </span>
      </div>

      <div className="mt-2.5 flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="tabular-nums">
          {stats.done} / {stats.total} tasks
        </span>
        {stats.activeAgents > 0 && (
          <span className="inline-flex items-center gap-1">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-blue-500" />
            {stats.activeAgents} agent{stats.activeAgents === 1 ? "" : "s"} running
          </span>
        )}
        <span className="ml-auto">Updated {relativeTime(project.updatedAt)}</span>
      </div>
    </Link>
  );
}
