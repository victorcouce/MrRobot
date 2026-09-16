"use client";

import type { Task } from "../../lib/types";
import { agentLabel } from "../../lib/api";
import { elapsed } from "../../lib/format";

export function AgentsPanel({ tasks }: { tasks: Task[] }) {
  const running = tasks.filter((task) => task.status === "running");
  const done = tasks.filter((task) => task.status === "done");

  return (
    <div>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        Active agents
      </h3>

      {running.length === 0 ? (
        <p className="text-sm text-zinc-500">No hay ejecuciones en curso.</p>
      ) : (
        <ul className="space-y-2">
          {running.map((task) => (
            <li
              key={task.id}
              className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{task.title}</div>
                <div className="text-xs text-zinc-400">
                  {agentLabel(task.agent)} · {task.id}
                </div>
              </div>
              <span className="ml-3 shrink-0 text-xs tabular-nums text-zinc-500">
                {elapsed(task.startedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Completed
          </h3>
          <p className="text-sm text-zinc-500">
            {done.length} task{done.length === 1 ? "" : "s"} completada
            {done.length === 1 ? "" : "s"}.
          </p>
        </div>
      )}
    </div>
  );
}
