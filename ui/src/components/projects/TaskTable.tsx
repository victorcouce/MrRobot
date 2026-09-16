"use client";

import type { Task } from "../../lib/types";
import {
  COMPLEXITY_LABELS,
  TASK_STATUS,
  TASK_TYPE_LABELS,
} from "../../lib/status";
import { agentLabel } from "../../lib/api";
import { StatusBadge } from "../ui/Badge";

export function TaskTable({
  tasks,
  onSelect,
}: {
  tasks: Task[];
  onSelect: (id: string) => void;
}) {
  if (tasks.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        No hay tareas en el plan.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <th className="px-3 py-2 font-medium">ID</th>
            <th className="px-3 py-2 font-medium">Task</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Complexity</th>
            <th className="px-3 py-2 font-medium">Agent</th>
            <th className="px-3 py-2 font-medium">Dependencies</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const status = TASK_STATUS[task.status];
            return (
              <tr
                key={task.id}
                onClick={() => onSelect(task.id)}
                className="cursor-pointer border-b border-zinc-100 transition-colors last:border-0 hover:bg-zinc-50 dark:border-zinc-800/60 dark:hover:bg-zinc-800/50"
              >
                <td className="px-3 py-2.5 font-mono text-xs text-zinc-500">
                  {task.id}
                </td>
                <td className="max-w-xs px-3 py-2.5">
                  <div className="truncate font-medium text-zinc-800 dark:text-zinc-100">
                    {task.title}
                  </div>
                  {task.blockedReason && (
                    <div className="truncate text-xs text-orange-600 dark:text-orange-400">
                      {task.blockedReason}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-400">
                  {TASK_TYPE_LABELS[task.type] ?? task.type}
                </td>
                <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-400">
                  {COMPLEXITY_LABELS[task.complexity] ?? task.complexity}
                </td>
                <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-400">
                  {agentLabel(task.agent)}
                </td>
                <td className="px-3 py-2.5 font-mono text-xs text-zinc-500">
                  {task.dependsOn && task.dependsOn.length > 0
                    ? task.dependsOn.join(", ")
                    : "—"}
                </td>
                <td className="px-3 py-2.5">
                  <StatusBadge
                    label={status.label}
                    color={status.color}
                    pulse={status.pulse}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
