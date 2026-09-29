"use client";

import { useState } from "react";
import type { ProjectEvent, Task, TaskInstructionOutcome } from "../../lib/types";
import { monoAgentLabel } from "../../lib/agents";
import { elapsed, formatDuration } from "../../lib/format";
import { Chip } from "../ui/Chip";
import { ChevronDownIcon } from "../ui/icons";
import { clsx } from "../../lib/cx";
import { TaskLog } from "./TaskLog";

interface ColumnSpec {
  label: string;
  dot: string;
  empty: string;
  match: (task: Task) => boolean;
}

const COLUMNS: ColumnSpec[] = [
  {
    label: "En curso",
    dot: "bg-primary",
    empty: "Nada en curso",
    match: (task) => task.status === "running",
  },
  {
    label: "Listas",
    dot: "bg-primary/60",
    empty: "Nada en cola",
    match: (task) => task.status === "ready",
  },
  {
    label: "Bloqueadas",
    dot: "bg-warning",
    empty: "Sin bloqueos",
    match: (task) => task.status === "blocked" || task.status === "interrupted",
  },
  {
    label: "Fallidas",
    dot: "bg-danger",
    empty: "Sin fallos",
    match: (task) => task.status === "failed",
  },
  {
    label: "Hechas",
    dot: "bg-success",
    empty: "Nada hecho",
    match: (task) => task.status === "done",
  },
];

function cardTime(task: Task): string {
  if (task.status === "running") return elapsed(task.startedAt);
  if (task.status === "done" && task.startedAt && task.finishedAt) {
    return formatDuration(task.startedAt, task.finishedAt);
  }
  return "—";
}

function cardNote(task: Task): { text: string; className: string } | null {
  if (task.blockedReason) {
    return { text: task.blockedReason, className: "text-ink-4" };
  }
  if (task.status === "failed" && task.error) {
    return { text: task.error, className: "text-danger-text" };
  }
  return null;
}

function TaskCard({
  task,
  events,
  liveOutput,
  onSelect,
  onSendInstructions,
}: {
  task: Task;
  events: ProjectEvent[];
  liveOutput?: string;
  onSelect: (id: string) => void;
  onSendInstructions?: (instructions: string) => Promise<TaskInstructionOutcome>;
}) {
  const [open, setOpen] = useState(false);
  const hasLog = events.length > 0 || (task.attempts?.length ?? 0) > 0;
  const note = cardNote(task);
  const running = task.status === "running";

  return (
    <div
      className={clsx(
        "overflow-hidden rounded-[12px] border bg-surface",
        running ? "border-primary/40 ring-4 ring-primary-soft" : "border-line",
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(task.id)}
        className="focus-ring w-full p-3 text-left"
      >
        <span className="font-mono text-[11px] text-ink-4">{task.id}</span>
        <span className="mt-1 block text-[13px] font-medium leading-snug text-ink">
          {task.title}
        </span>
        {note && (
          <span className={clsx("mt-1 block text-[11.5px] leading-snug", note.className)}>
            {note.text}
          </span>
        )}
        <span className="mt-2 flex items-center justify-between gap-1.5">
          <Chip mono>{monoAgentLabel(task.agent)}</Chip>
          <span className="font-mono text-[11.5px] tabular-nums text-ink-4">
            {cardTime(task)}
          </span>
        </span>
      </button>

      {hasLog && (
        <button
          type="button"
          aria-label={open ? "Ocultar actividad" : "Ver actividad"}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="focus-ring flex w-full items-center justify-center gap-1 border-t border-line-soft py-1 text-[11px] text-ink-4 hover:bg-subtle"
        >
          <ChevronDownIcon
            size={12}
            className={open ? "rotate-180 transition-transform" : "transition-transform"}
          />
          Actividad
        </button>
      )}

      {open && hasLog && (
        <div className="border-t border-line-soft px-3 py-3">
          <TaskLog
            task={task}
            events={events}
            liveOutput={liveOutput}
            onSendInstructions={onSendInstructions}
          />
        </div>
      )}
    </div>
  );
}

export function ExecutionView({
  tasks,
  events,
  liveOutput,
  onSelect,
  onSendInstructions,
}: {
  tasks: Task[];
  events: ProjectEvent[];
  liveOutput?: Record<string, string>;
  onSelect: (id: string) => void;
  onSendInstructions?: (
    taskId: string,
    instructions: string,
  ) => Promise<TaskInstructionOutcome>;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 bg-bg p-4 md:grid-cols-3 xl:grid-cols-5">
      {COLUMNS.map((column) => {
        const columnTasks = tasks.filter(column.match);

        return (
          <div key={column.label} className="flex flex-col gap-2">
            <div className="flex h-[26px] items-center gap-2 px-0.5 text-[12.5px] font-semibold text-ink">
              <span
                className={clsx(
                  "h-[7px] w-[7px] rounded-full",
                  column.dot,
                  column.label === "En curso" && "pulse-dot",
                )}
              />
              {column.label}
              <span className="font-mono text-[11.5px] font-normal text-ink-4">
                {columnTasks.length}
              </span>
            </div>

            {columnTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                events={events.filter((event) => event.taskId === task.id)}
                liveOutput={liveOutput?.[task.id]}
                onSelect={onSelect}
                onSendInstructions={
                  onSendInstructions
                    ? (instructions) => onSendInstructions(task.id, instructions)
                    : undefined
                }
              />
            ))}

            {columnTasks.length === 0 && (
              <div className="flex h-16 items-center justify-center rounded-[12px] border border-dashed border-line-strong text-[12px] text-ink-4">
                {column.empty}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
