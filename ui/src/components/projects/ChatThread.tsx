"use client";

import { Fragment, useEffect, useRef } from "react";
import { AttachmentPreview } from "../AttachmentPreview";
import { Block, BlockFooter, BlockHeader } from "../ui/Block";
import { RobotAvatar } from "../ui/Chip";
import { Segmented } from "../ui/Segmented";
import { Button } from "../ui/Button";
import {
  ActivityIcon,
  AlertIcon,
  CheckIcon,
  CloseIcon,
  GitConflictIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RefreshIcon,
} from "../ui/icons";
import { monoAgentLabel } from "../../lib/agents";
import { describeEvent } from "../../lib/events";
import { clockTime } from "../../lib/format";
import { countLevels } from "../../lib/plan";
import { clsx } from "../../lib/cx";
import type {
  ChatMessage,
  Project,
  ProjectEvent,
  StoredReview,
  SupervisorRun,
  Task,
  TaskInstructionOutcome,
} from "../../lib/types";
import { DagView } from "./DagView";
import { ExecutionView } from "./ExecutionView";
import { GitConflictBlock } from "./GitConflictBlock";
import { PauseStateBlock } from "./PauseStateBlock";
import { PlannerErrorBlock } from "./PlannerErrorBlock";
import { PlanningState } from "./PlanningState";
import { TaskTable } from "./TaskTable";
import { PreviewPanel } from "./PreviewPanel";
import { ResultView } from "./ResultView";
import { SupervisorRunBlock } from "./SupervisorBanner";
import { TaskDetailBlock } from "./TaskDetailBlock";

type ViewMode = "list" | "graph" | "board";

const VIEW_OPTIONS: ReadonlyArray<{ id: ViewMode; label: string }> = [
  { id: "list", label: "Lista" },
  { id: "graph", label: "Grafo" },
  { id: "board", label: "Tablero" },
];

interface ChatThreadProps {
  project: Project;
  messages: ChatMessage[];
  events: ProjectEvent[];
  supervisorRuns: SupervisorRun[];
  reviews: StoredReview[];
  liveOutput?: Record<string, string>;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onSelectTask: (taskId: string | null) => void;
  selectedTaskId?: string | null;
  isEditable: boolean;
  onAddTask?: (() => void) | undefined;
  onEditTask?: (taskId: string) => void;
  onDeleteTask?: (taskId: string) => void;
  onStart?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  onRetryPlan?: () => void;
  onSendInstructions?: (
    taskId: string,
    instructions: string,
  ) => Promise<TaskInstructionOutcome>;
  /** Entrevista de afinado en curso: sustituye al estado vacío del hilo. */
  grillPanel?: React.ReactNode;
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
    <div className={clsx("w-full", wide ? "max-w-[1060px]" : "max-w-[820px]")}>
      {children}
    </div>
  );
}

function UserMessage({ message }: { message: ChatMessage }) {
  return (
    <Row>
      <div className="flex justify-end">
        <div className="max-w-[560px] rounded-[18px_18px_4px_18px] bg-user-bubble px-4 py-[11px]">
          <p className="whitespace-pre-wrap text-[15px] leading-normal text-ink">
            {message.content}
          </p>
          <AttachmentPreview attachments={message.attachments} />
        </div>
      </div>
    </Row>
  );
}

function Who({ label, meta }: { label: string; meta?: string }) {
  return (
    <div className="flex items-center gap-2 text-[12.5px] text-ink-4">
      <RobotAvatar />
      <span className="font-medium text-ink">{label}</span>
      {meta && <span>{meta}</span>}
    </div>
  );
}

function eventVisual(event: ProjectEvent): {
  icon: React.ReactNode;
  className: string;
} {
  switch (event.type) {
    case "task.completed":
    case "task.review_passed":
    case "project.completed":
      return {
        icon: <CheckIcon />,
        className: "bg-success-soft text-success",
      };
    case "task.failed":
    case "task.review_failed":
    case "project.error":
      return {
        icon: <AlertIcon />,
        className: "bg-danger-soft text-danger",
      };
    case "git.conflict":
    case "supervisor.replan":
      return {
        icon: <GitConflictIcon />,
        className: "bg-warning-soft text-warning-text",
      };
    case "project.paused":
      return {
        icon: <RefreshIcon />,
        className: "bg-muted text-ink-3",
      };
    default:
      return {
        icon: <ActivityIcon size={12} />,
        className: "bg-muted text-ink-3",
      };
  }
}

function EventRow({ event }: { event: ProjectEvent }) {
  const descriptor = describeEvent(event);
  const visual = eventVisual(event);

  return (
    <div className="grid grid-cols-[52px_20px_minmax(0,1fr)] items-center gap-2 text-[13px] text-ink-2">
      <span className="font-mono text-[11.5px] text-ink-4">
        {clockTime(event.createdAt)}
      </span>
      <span
        className={clsx(
          "inline-flex h-5 w-5 items-center justify-center rounded-[6px]",
          visual.className,
        )}
      >
        {visual.icon}
      </span>
      <span className="min-w-0 truncate">
        {descriptor.title}
        {descriptor.detail ? ` · ${descriptor.detail}` : ""}
      </span>
    </div>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const donePct = total > 0 ? (done / total) * 100 : 0;
  return (
    <span className="flex h-1 w-[180px] overflow-hidden rounded-[2px] bg-user-bubble">
      <span className="bg-success" style={{ width: `${donePct}%` }} />
    </span>
  );
}

export function ChatThread({
  project,
  messages,
  events,
  supervisorRuns,
  reviews,
  liveOutput,
  viewMode,
  onViewModeChange,
  onSelectTask,
  selectedTaskId,
  isEditable,
  onAddTask,
  onEditTask,
  onDeleteTask,
  onStart,
  onPause,
  onResume,
  onCancel,
  onRetryPlan,
  onSendInstructions,
  grillPanel,
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

  // Los eventos `supervisor.*` se representan con su bloque rico (con motivo e
  // instrucciones), así que se excluyen del listado compacto para no duplicar.
  const activityEvents = isRunningLike
    ? events
        .filter((event) => !event.type.startsWith("supervisor."))
        .slice(-12)
    : [];

  // El supervisor se intercala con la actividad en orden cronológico, en lugar
  // de quedar anclado al final del hilo.
  const timeline = [
    ...activityEvents.map((event) => ({
      kind: "event" as const,
      at: new Date(event.createdAt).getTime(),
      event,
    })),
    ...supervisorRuns
      .map((run, index) => ({ run, round: index + 1 }))
      .filter(({ run }) => run.action !== "continue")
      .map(({ run, round }) => ({
        kind: "supervisor" as const,
        at: new Date(run.createdAt).getTime(),
        run,
        round,
      })),
  ].sort((a, b) => a.at - b.at);

  const empty = messages.length === 0 && !hasTasks && !grillPanel;

  const orderedMessages = [...messages].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const planAnchorMessageId =
    orderedMessages.find(
      (message) => message.role === "assistant" && message.taskIds.length > 0,
    )?.id ?? null;

  const levels = countLevels(project.tasks);

  const planBlock = hasTasks ? (
    <Row wide={isWideView}>
      <Block>
        <BlockHeader
          title={viewMode === "board" ? "Tablero" : "Plan"}
          meta={
            isRunningLike ? (
              <span className="flex items-center gap-2.5">
                <ProgressBar
                  done={project.stats.done}
                  total={project.stats.total}
                />
                <span>
                  <span className="font-medium text-ink">
                    {project.stats.done} de {project.stats.total}
                  </span>{" "}
                  hechas · {project.stats.activeAgents}{" "}
                  {project.stats.activeAgents === 1
                    ? "agente trabajando"
                    : "agentes trabajando"}
                </span>
              </span>
            ) : (
              `${project.tasks.length} ${
                project.tasks.length === 1 ? "tarea" : "tareas"
              } · ${levels} ${levels === 1 ? "nivel" : "niveles"}${
                isEditable ? " · editable" : ""
              }`
            )
          }
          actions={
            <Segmented
              options={VIEW_OPTIONS}
              value={viewMode}
              onChange={onViewModeChange}
              label="Vista del plan"
            />
          }
        />

        {isRunningLike && (
          <div className="h-0.5 overflow-hidden bg-primary-soft">
            <div className="h-full w-2/5 animate-[slide_1.8s_ease-in-out_infinite] bg-primary" />
          </div>
        )}

        {viewMode === "list" && (
          <TaskTable
            tasks={project.tasks}
            events={events}
            onSelect={onSelectTask}
            onSendInstructions={onSendInstructions}
          />
        )}
        {viewMode === "graph" && (
          <DagView tasks={project.tasks} onSelect={onSelectTask} />
        )}
        {viewMode === "board" && (
          <ExecutionView
            tasks={project.tasks}
            events={events}
            liveOutput={liveOutput}
            onSelect={onSelectTask}
            onSendInstructions={onSendInstructions}
          />
        )}

        {isRunningLike ? (
          <BlockFooter>
            <span className="text-[12.5px] text-ink-4">
              Cada tarea corre en su propio worktree. Tu rama{" "}
              <span className="font-mono text-[12px]">main</span> no se toca.
            </span>
            {onPause && (
              <Button variant="secondary" size="sm" onClick={onPause}>
                <PauseIcon />
                Pausar tras este lote
              </Button>
            )}
          </BlockFooter>
        ) : (
          <BlockFooter>
            <div className="flex gap-1">
              {isEditable && onAddTask && (
                <Button variant="ghost" size="sm" onClick={onAddTask}>
                  <PlusIcon size={14} strokeWidth={2} />
                  Añadir tarea
                </Button>
              )}
              {onRetryPlan && (
                <Button variant="ghost" size="sm" onClick={onRetryPlan}>
                  Regenerar plan
                </Button>
              )}
            </div>
            {project.status === "ready" && onStart && (
              <Button variant="primary" size="sm" onClick={onStart}>
                <PlayIcon />
                Ejecutar plan
              </Button>
            )}
          </BlockFooter>
        )}
      </Block>
    </Row>
  ) : null;

  return (
    <div className="flex-1 overflow-y-auto" aria-live="polite">
      <div className="mx-auto flex w-full max-w-[1060px] flex-col items-center gap-7 px-6 pt-9">
        {empty && (
          <Row>
            <div className="flex flex-col items-center gap-2 pt-16 pb-2 text-center">
              <h1 className="font-display text-[44px] font-normal leading-none tracking-[-0.01em] text-ink">
                ¿Qué construimos en {project.name}?
              </h1>
              <p className="max-w-[560px] text-[14.5px] text-ink-3">
                Cuéntame qué quieres construir y genero el plan.
              </p>
            </div>
          </Row>
        )}

        {orderedMessages.map((message) => {
          const wide = message.id === planAnchorMessageId && isWideView;

          return (
            <Fragment key={message.id}>
              {message.role === "user" ? (
                <UserMessage message={message} />
              ) : message.error ? (
                <Row>
                  <PlannerErrorBlock error={message.error} onRetry={onRetryPlan} />
                </Row>
              ) : (
                <Row wide={wide}>
                  <div className="flex flex-col gap-3">
                    <Who
                      label="Planner"
                      meta={`${monoAgentLabel(message.agent)} · ${clockTime(
                        message.createdAt,
                      )}`}
                    />
                    <p className="max-w-[820px] whitespace-pre-wrap text-[15px] leading-relaxed text-ink">
                      {message.content}
                    </p>
                    {message.id === planAnchorMessageId && planBlock}
                  </div>
                </Row>
              )}
            </Fragment>
          );
        })}

        {grillPanel && <Row>{grillPanel}</Row>}

        {hasTasks && planAnchorMessageId === null && planBlock}

        {project.status === "planning" && !grillPanel && (
          <Row>
            <Block>
              <PlanningState />
            </Block>
          </Row>
        )}

        {timeline.length > 0 && (
          <Row>
            <div className="flex flex-col gap-0.5">
              {timeline.map((item) =>
                item.kind === "event" ? (
                  <EventRow key={item.event.id} event={item.event} />
                ) : (
                  <div key={item.run.id} className="py-1.5">
                    <SupervisorRunBlock run={item.run} round={item.round} />
                  </div>
                ),
              )}
            </div>
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
            <GitConflictBlock
              task={task}
              onRequestReplan={
                project.status === "blocked" ? onResume : undefined
              }
            />
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

        {isFinished && (
          <Row>
            {project.status === "cancelled" ? (
              <Block>
                <div className="flex items-center gap-3 px-[18px] py-4">
                  <span className="flex h-5 w-5 items-center justify-center rounded-[6px] bg-muted text-ink-3">
                    <CloseIcon />
                  </span>
                  <p className="text-[13.5px] text-ink-2">
                    Ejecución cancelada. No se generó una rama final.
                  </p>
                </div>
              </Block>
            ) : (
              <ResultView
                project={project}
                reviews={reviews}
                runs={supervisorRuns}
                onRetryPlan={onRetryPlan}
              />
            )}
          </Row>
        )}

        {project.status === "completed" && (
          <Row>
            <PreviewPanel project={project} />
          </Row>
        )}

        <div ref={threadEndRef} />
      </div>
    </div>
  );
}
