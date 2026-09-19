"use client";

import { useState } from "react";
import type { ProjectEvent, Task, TaskInstructionOutcome } from "../../lib/types";
import { TASK_STATUS } from "../../lib/status";
import { monoAgentLabel } from "../../lib/agents";
import { DOT_CLASSES } from "../ui/Badge";
import { ChevronDownIcon } from "../ui/icons";
import { clsx } from "../../lib/cx";
import { TaskLog } from "./TaskLog";

const COMPLEXITY_LEVEL: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/** Barras de complejidad 1–4, como `.lvl` del diseño. */
function ComplexityBars({ complexity }: { complexity: string }) {
  const level = COMPLEXITY_LEVEL[complexity] ?? 1;
  const heights = [6, 9, 12, 15];

  return (
    <span
      className="inline-flex items-end gap-0.5"
      aria-label={`complejidad ${complexity}`}
    >
      {heights.map((height, index) => (
        <i
          key={height}
          className={clsx(
            "block w-[3px] rounded-[1px]",
            index < level ? "bg-ink" : "bg-line-strong",
          )}
          style={{ height }}
        />
      ))}
    </span>
  );
}

const GRID = "grid grid-cols-[112px_minmax(0,1fr)_150px_130px_120px] items-center gap-3 px-[18px]";

export function TaskTable({
  tasks,
  events,
  onSelect,
  onSendInstructions,
}: {
  tasks: Task[];
  events: ProjectEvent[];
  onSelect: (id: string) => void;
  onSendInstructions?: (
    taskId: string,
    instructions: string,
  ) => Promise<TaskInstructionOutcome>;
}) {
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  if (tasks.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-ink-4">
        No hay tareas en el plan.
      </p>
    );
  }

  const eventsFor = (taskId: string) =>
    events.filter((event) => event.taskId === taskId);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        <div
          className={clsx(
            GRID,
            "h-[34px] border-b border-line-soft text-[11.5px] font-medium text-ink-4",
          )}
        >
          <span>ID</span>
          <span>Tarea</span>
          <span>Tipo · complejidad</span>
          <span>Agente</span>
          <span>Depende de</span>
        </div>

        {tasks.map((task) => {
          const taskEvents = eventsFor(task.id);
          const hasLog =
            taskEvents.length > 0 || (task.attempts?.length ?? 0) > 0;
          const open = openTaskId === task.id;
          const status = TASK_STATUS[task.status];
          const showDot = task.status !== "todo" && task.status !== "ready";

          return (
            <div key={task.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => onSelect(task.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    onSelect(task.id);
                  }
                }}
                className={clsx(
                  GRID,
                  "group focus-ring h-12 cursor-pointer border-b border-line-soft text-[13.5px] text-ink last:border-b-0 hover:bg-subtle",
                )}
              >
                <span className="flex items-center gap-1.5 font-mono text-[12px] text-ink-4">
                  {hasLog ? (
                    <button
                      type="button"
                      aria-label={open ? "Ocultar actividad" : "Ver actividad"}
                      aria-expanded={open}
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenTaskId(open ? null : task.id);
                      }}
                      className="focus-ring -ml-1 flex h-5 w-5 items-center justify-center rounded-chip text-ink-4 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100 focus:opacity-100"
                    >
                      <ChevronDownIcon
                        size={12}
                        className={open ? "rotate-180 transition-transform" : "transition-transform"}
                      />
                    </button>
                  ) : showDot ? (
                    <span
                      className={clsx(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        DOT_CLASSES[status.color],
                      )}
                      aria-hidden="true"
                    />
                  ) : null}
                  <span className="truncate">{task.id}</span>
                </span>

                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{task.title}</span>
                </span>

                <span className="flex items-center gap-2">
                  <span className="inline-flex h-[22px] items-center rounded-[6px] bg-muted px-[7px] font-mono text-[11.5px] text-ink-2">
                    {task.type}
                  </span>
                  <ComplexityBars complexity={task.complexity} />
                </span>

                <span className="truncate font-mono text-[12px] text-ink-2">
                  {monoAgentLabel(task.agent)}
                </span>

                <span className="truncate font-mono text-[12px] text-ink-4">
                  {task.dependsOn && task.dependsOn.length > 0
                    ? task.dependsOn.join(" · ")
                    : "—"}
                </span>
              </div>

              {open && hasLog && (
                <div className="border-b border-line-soft bg-subtle px-[18px] py-3">
                  <TaskLog
                    task={task}
                    events={taskEvents}
                    onSendInstructions={
                      onSendInstructions
                        ? (instructions) => onSendInstructions(task.id, instructions)
                        : undefined
                    }
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
