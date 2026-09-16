"use client";

import type { Task } from "../../lib/types";
import { agentLabel } from "../../lib/api";
import { elapsed } from "../../lib/format";
import { clsx } from "../../lib/cx";

function TaskCard({
  task,
  onSelect,
}: {
  task: Task;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onSelect(task.id)}
      className="focus-ring w-full rounded-md border border-zinc-200 bg-white p-3 text-left transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] text-zinc-400">{task.id}</span>
        {task.status === "running" && (
          <span className="text-[10px] tabular-nums text-zinc-400">
            {elapsed(task.startedAt)}
          </span>
        )}
      </div>
      <div className="mt-1 text-sm font-medium text-zinc-800 dark:text-zinc-100">
        {task.title}
      </div>
      <div className="mt-1 text-xs text-zinc-400">
        {agentLabel(task.agent)}
        {task.blockedReason ? ` · ${task.blockedReason}` : ""}
      </div>
    </button>
  );
}

function Column({
  title,
  tasks,
  onSelect,
  accent,
}: {
  title: string;
  tasks: Task[];
  onSelect: (id: string) => void;
  accent: string;
}) {
  if (tasks.length === 0) return null;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className={clsx("h-2 w-2 rounded-full", accent)} />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          {title}
        </h3>
        <span className="text-xs text-zinc-400">{tasks.length}</span>
      </div>
      <div className="space-y-2">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

export function ExecutionView({
  tasks,
  onSelect,
}: {
  tasks: Task[];
  onSelect: (id: string) => void;
}) {
  const running = tasks.filter((task) => task.status === "running");
  const ready = tasks.filter((task) => task.status === "ready");
  const blocked = tasks.filter(
    (task) => task.status === "blocked" || task.status === "interrupted",
  );
  const failed = tasks.filter((task) => task.status === "failed");

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-4">
      <Column
        title="Running"
        tasks={running}
        onSelect={onSelect}
        accent="bg-blue-500"
      />
      <Column
        title="Ready"
        tasks={ready}
        onSelect={onSelect}
        accent="bg-sky-500"
      />
      <Column
        title="Blocked"
        tasks={blocked}
        onSelect={onSelect}
        accent="bg-orange-500"
      />
      <Column
        title="Failed"
        tasks={failed}
        onSelect={onSelect}
        accent="bg-red-500"
      />
    </div>
  );
}
