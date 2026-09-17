"use client";

import { useEffect, useRef } from "react";
import { AttachmentPreview } from "../AttachmentPreview";
import { Block, BlockContent, BlockHeader } from "../ui/Block";
import { agentLabel } from "../../lib/api";
import { describeEvent } from "../../lib/events";
import { clockTime } from "../../lib/format";
import { clsx } from "../../lib/cx";
import type {
  ChatMessage,
  Project,
  ProjectEvent,
  StoredReview,
  SupervisorRun,
} from "../../lib/types";
import { DagView } from "./DagView";
import { ExecutionView } from "./ExecutionView";
import { GitConflictBlock } from "./GitConflictBlock";
import { PauseStateBlock } from "./PauseStateBlock";
import { PlannerErrorBlock } from "./PlannerErrorBlock";
import { PlanningState } from "./PlanningState";
import { PlanView } from "./PlanView";
import { PreviewPanel } from "./PreviewPanel";
import { ResultView } from "./ResultView";
import { SupervisorBanner } from "./SupervisorBanner";
import { TaskDetailBlock } from "./TaskDetailBlock";

type ViewMode = "list" | "graph" | "board";

const VIEW_LABELS: Record<ViewMode, string> = {
  list: "Lista",
  graph: "Grafo",
  board: "Tablero",
};

interface ChatThreadProps {
  project: Project;
  messages: ChatMessage[];
  events: ProjectEvent[];
  supervisorRuns: SupervisorRun[];
  reviews: StoredReview[];
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onSelectTask: (taskId: string | null) => void;
  selectedTaskId?: string | null;
  isEditable: boolean;
  onAddTask?: (() => void) | undefined;
  onEditTask?: (taskId: string) => void;
  onDeleteTask?: (taskId: string) => void;
  onResume?: () => void;
  onCancel?: () => void;
  onRetryPlan?: () => void;
}

/** Columna del hilo: 820px, salvo los bloques anchos (grafo y tablero). */
function Row({
  children,
  wide,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={clsx(
        "mx-auto w-full",
        wide ? "max-w-[1060px]" : "max-w-[820px]",
      )}
    >
      {children}
    </div>
  );
}

function UserMessage({ message }: { message: ChatMessage }) {
  return (
    <Row>
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-block bg-user-bubble px-4 py-3">
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">
            {message.content}
          </p>
          <AttachmentPreview attachments={message.attachments} />
        </div>
      </div>
    </Row>
  );
}

function AssistantMessage({ message }: { message: ChatMessage }) {
  const taskCount = message.taskIds.length;

  return (
    <Row>
      <div className="space-y-2">
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">
          {message.content}
        </p>
        <div className="flex items-center gap-3 text-xs text-ink-4">
          {message.agent && (
            <span className="font-mono">{agentLabel(message.agent)}</span>
          )}
          {taskCount > 0 && (
            <span>
              {taskCount} {taskCount === 1 ? "tarea" : "tareas"}
            </span>
          )}
          <span>{clockTime(message.createdAt)}</span>
        </div>
      </div>
    </Row>
  );
}

function EventRow({ event }: { event: ProjectEvent }) {
  const descriptor = describeEvent(event);

  return (
    <Row>
      <div className="flex items-baseline gap-3 text-xs">
        <span className="w-12 shrink-0 font-mono tabular-nums text-ink-4">
          {clockTime(event.createdAt)}
        </span>
        <span className="text-ink-3">{descriptor.title}</span>
        {descriptor.detail && (
          <span className="truncate text-ink-4">{descriptor.detail}</span>
        )}
      </div>
    </Row>
  );
}

export function ChatThread({
  project,
  messages,
  events,
  supervisorRuns,
  reviews,
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
  onRetryPlan,
}: ChatThreadProps) {
  const threadEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, events.length, project.status]);

  const isRunningLike =
    project.status === "running" ||
    project.status === "paused" ||
    project.status === "blocked";
  const isFinished =
    project.status === "completed" ||
    project.status === "failed" ||
    project.status === "cancelled";

  const hasTasks = project.tasks.length > 0;
  const selectedTask = selectedTaskId
    ? project.tasks.find((task) => task.id === selectedTaskId)
    : undefined;
  const conflicted = project.tasks.filter((task) => task.integrationError);
  const isWideView = viewMode !== "list";

  // Los eventos solo aportan durante la ejecución; fuera de ella el hilo se
  // queda con la conversación y los bloques de estado.
  const visibleEvents = isRunningLike ? events.slice(-12) : [];

  const empty = messages.length === 0 && !hasTasks;

  return (
    <div className="flex-1 overflow-y-auto" aria-live="polite">
      <div className="mx-auto w-full max-w-[1060px] space-y-6 px-4 py-6">
        {empty && (
          <Row>
            <p className="py-16 text-center text-sm text-ink-3">
              Cuéntame qué quieres construir y genero el plan.
            </p>
          </Row>
        )}

        {messages.map((message) =>
          message.role === "user" ? (
            <UserMessage key={message.id} message={message} />
          ) : message.error ? (
            <Row key={message.id}>
              <PlannerErrorBlock error={message.error} onRetry={onRetryPlan} />
            </Row>
          ) : (
            <AssistantMessage key={message.id} message={message} />
          ),
        )}

        {project.status === "planning" && (
          <Row>
            <Block>
              <PlanningState />
            </Block>
          </Row>
        )}

        {hasTasks && (
          <Row wide={isWideView}>
            <Block>
              <BlockHeader
                title="Plan"
                subtitle={`${project.stats.done} de ${project.stats.total} hechas`}
                actions={
                  <div className="inline-flex gap-1 rounded-chip bg-muted p-1">
                    {(Object.keys(VIEW_LABELS) as ViewMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={viewMode === mode}
                        onClick={() => onViewModeChange(mode)}
                        className={clsx(
                          "focus-ring rounded-chip px-2.5 py-1 text-xs font-medium transition-colors",
                          viewMode === mode
                            ? "bg-surface text-ink shadow-sm"
                            : "text-ink-3 hover:text-ink-2",
                        )}
                      >
                        {VIEW_LABELS[mode]}
                      </button>
                    ))}
                  </div>
                }
              />
              <BlockContent>
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
                  <ExecutionView tasks={project.tasks} onSelect={onSelectTask} />
                )}
              </BlockContent>
            </Block>
          </Row>
        )}

        {visibleEvents.map((event) => (
          <EventRow key={event.id} event={event} />
        ))}

        {isRunningLike && (
          <Row wide>
            <Block>
              <BlockHeader
                title="Ejecución en vivo"
                subtitle={`${project.stats.done} de ${project.stats.total} hechas · ${project.stats.activeAgents} ${
                  project.stats.activeAgents === 1
                    ? "agente trabajando"
                    : "agentes trabajando"
                }`}
              />
              <BlockContent>
                <ExecutionView tasks={project.tasks} onSelect={onSelectTask} />
              </BlockContent>
            </Block>
          </Row>
        )}

        {selectedTask && (
          <Row>
            <TaskDetailBlock
              task={selectedTask}
              reviews={reviews}
              onEdit={onEditTask ? () => onEditTask(selectedTask.id) : undefined}
              onDelete={
                onDeleteTask ? () => onDeleteTask(selectedTask.id) : undefined
              }
            />
          </Row>
        )}

        {conflicted.map((task) => (
          <Row key={`conflict-${task.id}`}>
            <GitConflictBlock task={task} />
          </Row>
        ))}

        {project.status === "paused" && (
          <Row>
            <PauseStateBlock
              project={project}
              onResume={onResume}
              onCancel={onCancel}
            />
          </Row>
        )}

        {supervisorRuns.length > 0 && (
          <Row>
            <Block>
              <BlockContent>
                <SupervisorBanner runs={supervisorRuns} />
              </BlockContent>
            </Block>
          </Row>
        )}

        {isFinished && (
          <Row>
            {project.status === "cancelled" ? (
              <Block>
                <BlockContent>
                  <p className="text-sm text-ink-3">
                    Ejecución cancelada. No se generó una rama final.
                  </p>
                </BlockContent>
              </Block>
            ) : (
              <Block>
                <BlockContent>
                  <ResultView project={project} />
                </BlockContent>
              </Block>
            )}
          </Row>
        )}

        {isFinished && project.status !== "cancelled" && (
          <Row>
            <Block>
              <BlockHeader title="Preview" />
              <BlockContent>
                <PreviewPanel project={project} />
              </BlockContent>
            </Block>
          </Row>
        )}

        <div ref={threadEndRef} />
      </div>
    </div>
  );
}
