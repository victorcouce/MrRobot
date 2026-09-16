"use client";

import { useState } from "react";
import { api } from "../../lib/api";
import { choiceToAgent } from "../../lib/agents";
import { useProject } from "../../lib/hooks";
import { PROJECT_STATUS } from "../../lib/status";
import type { Task } from "../../lib/types";
import { Button } from "../ui/Button";
import { StatusBadge, LoadingState } from "../ui/Badge";
import { ProgressBar } from "../ui/Progress";
import { Dialog } from "../ui/Dialog";
import { Tabs } from "../ui/Tabs";
import { ActivityLog } from "./ActivityLog";
import { AgentsPanel } from "./AgentsPanel";
import { DagView } from "./DagView";
import { ExecutionView } from "./ExecutionView";
import { PlanView } from "./PlanView";
import { PlanningState } from "./PlanningState";
import { ResultView } from "./ResultView";
import { SupervisorBanner } from "./SupervisorBanner";
import { TaskDetail } from "./TaskDetail";
import { TaskEditor, type TaskFormData } from "./TaskEditor";
import { TaskTable } from "./TaskTable";

type EditorState =
  | { mode: "edit"; task: Task }
  | { mode: "create" }
  | null;

export function ProjectWorkspace({ id }: { id: string }) {
  const { project, events, reviews, supervisorRuns, loading, error, refresh } =
    useProject(id);

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [confirmStart, setConfirmStart] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("board");

  async function run(action: string, fn: () => Promise<unknown>) {
    setBusy(action);
    setActionError(null);
    try {
      await fn();
      await refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingState label="Cargando proyecto…" />
      </div>
    );
  }

  if (error && !project) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16">
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      </div>
    );
  }

  if (!project) return null;

  const status = PROJECT_STATUS[project.status];
  const { stats } = project;
  const isEditable = project.status === "ready";
  const selectedTask = project.tasks.find((task) => task.id === selectedTaskId);

  async function submitTask(data: TaskFormData) {
    setBusy("task");
    setActionError(null);

    try {
      const agent = data.agent === "auto" ? undefined : choiceToAgent(data.agent);

      if (editor?.mode === "edit" && editor.task) {
        await api.updateTask(id, editor.task.id, {
          title: data.title,
          description: data.description,
          type: data.type,
          complexity: data.complexity,
          dependsOn: data.dependsOn,
          acceptanceCriteria: data.acceptanceCriteria,
          agent: agent ?? null,
        });
      } else {
        await api.addTask(id, {
          title: data.title,
          description: data.description,
          type: data.type,
          complexity: data.complexity,
          dependsOn: data.dependsOn,
          acceptanceCriteria: data.acceptanceCriteria,
          ...(agent ? { agent } : {}),
        });
      }

      setEditor(null);
      await refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function removeSelectedTask() {
    if (!selectedTask) return;
    setBusy("task");
    setActionError(null);
    try {
      await api.removeTask(id, selectedTask.id);
      setSelectedTaskId(null);
      await refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  const isRunningLike =
    project.status === "running" ||
    project.status === "paused" ||
    project.status === "blocked";
  const isFinished =
    project.status === "completed" ||
    project.status === "failed" ||
    project.status === "cancelled";
  const effectiveTab = isFinished
    ? ["graph", "tasks", "activity"].includes(activeTab)
      ? activeTab
      : "graph"
    : ["board", "graph", "activity"].includes(activeTab)
      ? activeTab
      : "board";

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight">
            {project.name}
          </h1>
          <StatusBadge
            label={status.label}
            color={status.color}
            pulse={status.pulse}
          />
          <div className="ml-auto flex items-center gap-2">
            {project.status === "ready" && (
              <Button
                variant="primary"
                onClick={() => setConfirmStart(true)}
              >
                Start project
              </Button>
            )}
            {project.status === "running" && (
              <Button
                onClick={() => run("pause", () => api.pause(id))}
                loading={busy === "pause"}
              >
                Pause
              </Button>
            )}
            {project.status === "paused" && (
              <Button
                variant="primary"
                onClick={() => run("resume", () => api.resume(id))}
                loading={busy === "resume"}
              >
                Resume
              </Button>
            )}
            {(project.status === "running" || project.status === "paused") && (
              <Button
                variant="danger"
                onClick={() => setConfirmCancel(true)}
              >
                Cancel
              </Button>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex min-w-[200px] flex-1 items-center gap-3">
            <ProgressBar value={stats.progress} className="flex-1" />
            <span className="text-sm font-medium tabular-nums text-zinc-600 dark:text-zinc-300">
              {stats.done} / {stats.total} tasks
            </span>
            <span className="text-xs tabular-nums text-zinc-400">
              {stats.progress}%
            </span>
          </div>
          {stats.activeAgents > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-blue-500" />
              {stats.activeAgents} agent{stats.activeAgents === 1 ? "" : "s"} active
            </span>
          )}
        </div>

        {actionError && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {actionError}
          </div>
        )}
      </header>

      {project.status === "draft" && (
        <div className="rounded-lg border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
          <h2 className="text-base font-semibold">Genera el plan</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500 dark:text-zinc-400">
            MrRobot descompondrá el objetivo en un DAG de tareas.
          </p>
          <div className="mt-4 flex justify-center">
            <Button
              variant="primary"
              onClick={() => run("plan", () => api.generatePlan(id))}
              loading={busy === "plan"}
            >
              Generate plan
            </Button>
          </div>
        </div>
      )}

      {project.status === "planning" && <PlanningState />}

      {project.status === "ready" && (
        <PlanView
          tasks={project.tasks}
          onSelectTask={setSelectedTaskId}
          onAddTask={() => setEditor({ mode: "create" })}
        />
      )}

      {isRunningLike && (
        <div className="space-y-4">
          <SupervisorBanner runs={supervisorRuns} />

          <Tabs
            tabs={[
              { id: "board", label: "Board" },
              { id: "graph", label: "Graph" },
              { id: "activity", label: "Activity", count: events.length },
            ]}
            active={effectiveTab}
            onChange={setActiveTab}
          />

          {effectiveTab === "board" && (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_280px]">
              <ExecutionView tasks={project.tasks} onSelect={setSelectedTaskId} />
              <aside>
                <AgentsPanel tasks={project.tasks} />
              </aside>
            </div>
          )}

          {effectiveTab === "graph" && (
            <DagView tasks={project.tasks} onSelect={setSelectedTaskId} />
          )}

          {effectiveTab === "activity" && <ActivityLog events={events} />}
        </div>
      )}

      {isFinished && (
        <div className="space-y-4">
          {project.status === "cancelled" && (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              Project cancelled. La ejecución se detuvo y no se generó una branch
              final.
            </div>
          )}
          {project.status !== "cancelled" && <ResultView project={project} />}
          <SupervisorBanner runs={supervisorRuns} />

          <Tabs
            tabs={[
              { id: "graph", label: "Graph" },
              { id: "tasks", label: "Tasks", count: project.tasks.length },
              { id: "activity", label: "Activity", count: events.length },
            ]}
            active={effectiveTab}
            onChange={setActiveTab}
          />

          {effectiveTab === "graph" && (
            <DagView tasks={project.tasks} onSelect={setSelectedTaskId} />
          )}
          {effectiveTab === "tasks" && (
            <TaskTable tasks={project.tasks} onSelect={setSelectedTaskId} />
          )}
          {effectiveTab === "activity" && <ActivityLog events={events} />}
        </div>
      )}

      {selectedTask && (
        <TaskDetail
          task={selectedTask}
          reviews={reviews}
          onClose={() => setSelectedTaskId(null)}
          editable={isEditable}
          onEdit={() => setEditor({ mode: "edit", task: selectedTask })}
          onDelete={removeSelectedTask}
        />
      )}

      {editor && (
        <TaskEditor
          mode={editor.mode}
          task={editor.mode === "edit" ? editor.task : undefined}
          tasks={project.tasks}
          onClose={() => setEditor(null)}
          onSubmit={submitTask}
          submitting={busy === "task"}
          error={actionError}
        />
      )}

      <Dialog
        open={confirmStart}
        onClose={() => setConfirmStart(false)}
        title="Start project"
        width="max-w-md"
      >
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          La ejecución puede modificar código, crear commits y ejecutar tests en
          worktrees aislados. El resultado se deja en una branch aislada y nunca
          se integra automáticamente a <code className="font-mono">main</code>.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setConfirmStart(false)}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === "start"}
            onClick={() => {
              setConfirmStart(false);
              void run("start", () => api.run(id));
            }}
          >
            Start project
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Cancel project"
        width="max-w-md"
      >
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Se detendrá la ejecución: las tareas en curso se interrumpen y no se
          lanzan nuevas tareas. El proyecto quedará en estado{" "}
          <span className="font-medium">Cancelled</span>.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setConfirmCancel(false)}>Keep running</Button>
          <Button
            variant="danger"
            loading={busy === "cancel"}
            onClick={() => {
              setConfirmCancel(false);
              void run("cancel", () => api.cancel(id));
            }}
          >
            Cancel project
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
