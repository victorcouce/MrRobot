"use client";

import { useEffect, useRef } from "react";
import type { Project, ProjectEvent, StoredReview, AgentAvailability } from "../../lib/types";
import { ActivityLog } from "./ActivityLog";
import { DagView } from "./DagView";
import { ExecutionView } from "./ExecutionView";
import { PlanningState } from "./PlanningState";
import { PlanView } from "./PlanView";
import { PreviewPanel } from "./PreviewPanel";
import { ResultView } from "./ResultView";
import { SupervisorBanner } from "./SupervisorBanner";
import { TaskDetailBlock } from "./TaskDetailBlock";
import { GitConflictBlock } from "./GitConflictBlock";
import { PauseStateBlock } from "./PauseStateBlock";
import { AgentsStatusBlock } from "./AgentsStatusBlock";
import type { SupervisorRun } from "../../lib/types";

type ViewMode = "list" | "graph" | "board";

interface ChatThreadProps {
  project: Project;
  events: ProjectEvent[];
  supervisorRuns: SupervisorRun[];
  reviews: StoredReview[];
  agents: AgentAvailability[];
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onSelectTask: (taskId: string | null) => void;
  selectedTaskId?: string | null;
  isEditable: boolean;
  onAddTask: (() => void) | undefined;
  onEditTask?: (taskId: string) => void;
  onDeleteTask?: (taskId: string) => void;
  onResume?: () => void;
  onCancel?: () => void;
  onConfigureDeepSeek?: () => void;
}

export function ChatThread({
  project,
  events,
  supervisorRuns,
  reviews,
  agents,
  viewMode,
  onViewModeChange,
  onSelectTask,
  selectedTaskId,
  isEditable,
  onAddTask,
  onEditTask,
  onDeleteTask,
  onResume,
  onCancel,
  onConfigureDeepSeek,
}: ChatThreadProps) {
  const threadEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events, project.status]);

  const isRunningLike =
    project.status === "running" ||
    project.status === "paused" ||
    project.status === "blocked";
  const isFinished =
    project.status === "completed" ||
    project.status === "failed" ||
    project.status === "cancelled";

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[820px] space-y-6 px-4 py-6">
        {/* Planning state block */}
        {project.status === "planning" && (
          <div className="rounded-lg border border-line bg-surface p-6 shadow-sm">
            <PlanningState />
          </div>
        )}

        {/* Plan block (draft or ready) */}
        {(project.status === "draft" || project.status === "planning" || project.status === "ready") && (
          <div className="rounded-lg border border-line bg-surface p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">Plan</h2>
              <div className="flex gap-2">
                {["list", "graph", "board"].map((mode) => (
                  <button
                    key={mode}
                    onClick={() => onViewModeChange(mode as ViewMode)}
                    className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                      viewMode === mode
                        ? "bg-primary-soft text-primary-soft-text"
                        : "bg-muted text-ink-3 hover:bg-line"
                    }`}
                  >
                    {mode === "list" ? "Lista" : mode === "graph" ? "Grafo" : "Tablero"}
                  </button>
                ))}
              </div>
            </div>

            {viewMode === "list" && (
              <PlanView
                tasks={project.tasks}
                onSelectTask={onSelectTask}
                onAddTask={isEditable ? onAddTask : undefined}
              />
            )}
            {viewMode === "graph" && (
              <DagView tasks={project.tasks} onSelect={onSelectTask} />
            )}
            {viewMode === "board" && (
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_280px]">
                <ExecutionView tasks={project.tasks} onSelect={onSelectTask} />
              </div>
            )}
          </div>
        )}

        {/* Kanban in live execution */}
        {isRunningLike && (
          <div className="rounded-lg border border-line bg-surface p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-ink">Ejecución en vivo</h2>
            <ExecutionView tasks={project.tasks} onSelect={onSelectTask} />
          </div>
        )}

        {/* Selected task detail block */}
        {selectedTaskId && (
          <>
            {project.tasks.map((task) => {
              if (task.id !== selectedTaskId) return null;
              return (
                <TaskDetailBlock
                  key={task.id}
                  task={task}
                  reviews={reviews}
                  onEdit={onEditTask ? () => onEditTask(task.id) : undefined}
                  onDelete={onDeleteTask ? () => onDeleteTask(task.id) : undefined}
                />
              );
            })}
          </>
        )}

        {/* Git conflicts */}
        {project.tasks.map((task) => {
          if (!task.integrationError) return null;
          return (
            <GitConflictBlock
              key={`conflict-${task.id}`}
              task={task}
            />
          );
        })}

        {/* Pause state block */}
        <PauseStateBlock
          project={project}
          onResume={onResume}
          onCancel={onCancel}
        />

        {/* Events */}
        {events.length > 0 && (
          <div className="rounded-lg border border-line bg-surface p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-ink">Eventos</h2>
            <ActivityLog events={events} />
          </div>
        )}

        {/* Agents status block */}
        {agents.length > 0 && (
          <AgentsStatusBlock
            agents={agents}
            onConfigureDeepSeek={onConfigureDeepSeek}
          />
        )}

        {/* Supervisor */}
        {supervisorRuns.length > 0 && (
          <div className="rounded-lg border border-line bg-surface p-6 shadow-sm">
            <SupervisorBanner runs={supervisorRuns} />
          </div>
        )}

        {/* Result block (finished projects) */}
        {isFinished && (
          <div className="rounded-lg border border-line bg-surface p-6 shadow-sm">
            {project.status === "cancelled" && (
              <div className="mb-4 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                Project cancelled. La ejecución se detuvo y no se generó una
                branch final.
              </div>
            )}
            {project.status !== "cancelled" && <ResultView project={project} />}
          </div>
        )}

        {/* Preview block */}
        {isFinished && project.status !== "cancelled" && (
          <div className="rounded-lg border border-line bg-surface p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-ink">Preview</h2>
            <PreviewPanel project={project} />
          </div>
        )}

        {/* End marker for scroll */}
        <div ref={threadEndRef} />
      </div>
    </div>
  );
}
