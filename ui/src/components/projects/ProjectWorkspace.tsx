"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";
import { AGENT_CHOICES, choiceToAgent } from "../../lib/agents";
import { useProject, useAppInfo } from "../../lib/hooks";
import type { AgentSpec, Task } from "../../lib/types";
import { Button } from "../ui/Button";
import { LoadingState } from "../ui/Badge";
import { Dialog } from "../ui/Dialog";
import { ChatThread } from "./ChatThread";
import { ThreadComposer } from "./ThreadComposer";
import { ThreadHeader } from "./ThreadHeader";
import { ChatsPanel } from "./ChatsPanel";
import { ProjectSettingsDialog } from "./ProjectSettingsDialog";
import { TaskEditor, type TaskFormData } from "./TaskEditor";

type EditorState =
  | { mode: "edit"; task: Task }
  | { mode: "create" }
  | null;

type ViewMode = "list" | "graph" | "board";

export function ProjectWorkspace({
  id,
  initialChatId,
}: {
  id: string;
  initialChatId?: string;
}) {
  const { project, events, reviews, supervisorRuns, chats, loading, error, notFound, refresh } =
    useProject(id);
  const { info } = useAppInfo();
  const router = useRouter();

  const [editor, setEditor] = useState<EditorState>(null);
  const [confirmStart, setConfirmStart] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pauseRequested, setPauseRequested] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedChatId, setSelectedChatId] = useState<string | null>(initialChatId ?? null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (notFound) {
      router.replace("/");
    }
  }, [notFound, router]);

  useEffect(() => {
    if (project?.status !== "running") {
      setPauseRequested(false);
    }
  }, [project?.status]);

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

  async function requestPause() {
    setPauseRequested(true);
    setBusy("pause");
    setActionError(null);
    try {
      await api.pause(id);
      await refresh();
    } catch (error) {
      setPauseRequested(false);
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleSendMessage(
    message: string,
    attachments?: Array<{
      name: string;
      type: "image" | "markdown";
      mimeType: string;
      size: number;
      data: string;
    }>,
  ) {
    if (!selectedChatId) return;
    setBusy("message");
    setActionError(null);
    try {
      await api.sendChatMessage(id, selectedChatId, message, attachments);
      await refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleUpdateAllowedAgents(agents: AgentSpec[]) {
    if (!selectedChatId) return;
    setActionError(null);
    try {
      await api.updateChatAllowedAgents(id, selectedChatId, agents);
      await refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
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

  const isEditable = project.status === "ready";
  const canEditConfig =
    project.status === "draft" ||
    project.status === "ready" ||
    project.status === "paused";

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

  async function deleteCurrentProject() {
    setConfirmDelete(false);
    setBusy("delete");
    setActionError(null);
    try {
      await api.deleteProject(id);
      router.push("/");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
      setBusy(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ThreadHeader
        project={project}
        chatName={selectedChatId ? chats.find((c) => c.id === selectedChatId)?.title : undefined}
        onSettings={() => setSettingsOpen(true)}
        onStart={async () => {
          if (project.status === "draft") {
            await run("plan", () => api.generatePlan(id));
          } else {
            setConfirmStart(true);
          }
        }}
        onPause={() => void requestPause()}
        onResume={() => run("resume", () => api.resume(id))}
        onCancel={() => setConfirmCancel(true)}
        onDelete={() => setConfirmDelete(true)}
        busy={busy}
        pauseRequested={pauseRequested}
        actionError={actionError}
        canEditConfig={canEditConfig}
      />

      {/* Show ChatsPanel for draft/planning/ready states */}
      {(project.status === "draft" ||
        project.status === "planning" ||
        project.status === "ready") && (
        <div className="border-b border-line">
          <div className="mx-auto max-w-[820px] px-4 py-4 sm:px-6">
            <ChatsPanel
              project={project}
              chats={chats}
              initialChatId={initialChatId}
              onRefresh={refresh}
            />
          </div>
        </div>
      )}

      {/* Main chat thread */}
      <ChatThread
        project={project}
        events={events}
        supervisorRuns={supervisorRuns}
        reviews={reviews}
        agents={[]}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onSelectTask={setSelectedTaskId}
        selectedTaskId={selectedTaskId}
        isEditable={isEditable}
        onAddTask={() => setEditor({ mode: "create" })}
        onEditTask={(taskId) => {
          const task = project.tasks.find((t) => t.id === taskId);
          if (task) {
            setEditor({ mode: "edit", task });
          }
        }}
        onDeleteTask={async (taskId) => {
          setBusy("task");
          setActionError(null);
          try {
            await api.removeTask(id, taskId);
            setSelectedTaskId(null);
            await refresh();
          } catch (error) {
            setActionError(error instanceof Error ? error.message : String(error));
          } finally {
            setBusy(null);
          }
        }}
        onResume={() => run("resume", () => api.resume(id))}
        onCancel={() => setConfirmCancel(true)}
        onConfigureDeepSeek={() => setSettingsOpen(true)}
      />

      {/* Composer (always at bottom) */}
      {(() => {
        const selectedChat = selectedChatId
          ? chats?.find((c) => c.id === selectedChatId)
          : null;
        const connectedProviders = new Set(
          (info?.agents ?? [])
            .filter((agent) => agent.connected)
            .map((agent) => agent.provider),
        );
        const availableAgents: AgentSpec[] = AGENT_CHOICES.map((choice) =>
          choiceToAgent(choice.value),
        ).filter((agent) => connectedProviders.has(agent.provider));

        return (
          <ThreadComposer
            status={project.status}
            onSendMessage={handleSendMessage}
            onPauseAndWrite={() => void requestPause()}
            allowedAgents={selectedChat?.allowedAgents}
            availableAgents={availableAgents}
            onUpdateAllowedAgents={handleUpdateAllowedAgents}
            disabled={!selectedChatId}
          />
        );
      })()}

      {/* Modals and dialogs */}
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

      <ProjectSettingsDialog
        project={project}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => {
          void refresh();
        }}
      />

      <Dialog
        open={confirmStart}
        onClose={() => setConfirmStart(false)}
        title="Ejecutar proyecto"
        width="max-w-md"
      >
        <p className="text-sm text-ink-3">
          La ejecución puede modificar código, crear commits y ejecutar tests en
          worktrees aislados. El resultado se deja en una branch aislada y nunca
          se integra automáticamente a <code className="font-mono">main</code>.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setConfirmStart(false)}>Cancelar</Button>
          <Button
            variant="primary"
            loading={busy === "start"}
            onClick={() => {
              setConfirmStart(false);
              void run("start", () => api.run(id));
            }}
          >
            Ejecutar
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Cancelar proyecto"
        width="max-w-md"
      >
        <p className="text-sm text-ink-3">
          Se detendrá la ejecución: las tareas en curso se interrumpen y no se
          lanzan nuevas tareas. DeepSeek finalizará su lote actual. El proyecto
          quedará en estado <span className="font-medium">Cancelled</span>.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setConfirmCancel(false)}>Continuar</Button>
          <Button
            variant="danger"
            loading={busy === "cancel"}
            onClick={() => {
              setConfirmCancel(false);
              void run("cancel", () => api.cancel(id));
            }}
          >
            Cancelar proyecto
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Borrar proyecto"
        width="max-w-md"
      >
        <p className="text-sm text-ink-3">
          Se borrará <span className="font-medium">{project.name}</span> de la
          app, junto con sus tareas, eventos y reviews. El directorio en disco{" "}
          <span className="font-medium">no</span> se toca. Esta acción no se
          puede deshacer.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setConfirmDelete(false)}>Cancelar</Button>
          <Button
            variant="danger"
            loading={busy === "delete"}
            onClick={() => void deleteCurrentProject()}
          >
            Borrar proyecto
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
