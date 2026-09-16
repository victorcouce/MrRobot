import type { SupervisorRun } from "../../lib/types";

export function SupervisorBanner({ runs }: { runs: SupervisorRun[] }) {
  const notable = runs
    .filter((run) => run.action !== "continue")
    .slice(-3)
    .reverse();

  if (notable.length === 0) return null;

  return (
    <div className="space-y-2">
      {notable.map((run) => (
        <div
          key={run.id}
          className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/30"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
            <span className="text-xs font-semibold uppercase tracking-wide">
              Supervisor
            </span>
            <span className="rounded bg-amber-200 px-1.5 py-0.5 text-xs dark:bg-amber-900/50">
              {run.action}
            </span>
          </div>
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-200">
            {run.reason}
          </p>
          {run.instructions && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-300/80">
              {run.instructions}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
