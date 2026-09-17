"use client";

import { useEffect, useMemo, useState } from "react";
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
import { TaskEditor, type TaskFormData } from "./TaskEditor";

type EditorState = { mode: "edit"; task: Task } | { mode: "create" } | null;

type ViewMode = "list" | "graph" | "board";

interface ProcessedAttachment {
  name: string;
  type: "image" | "markdown";
  mimeType: string;
  size: number;
  data: string;
}

export function ProjectWorkspace({
  id,
  initialChatId,
}: {
  id: string;
  initialChatId?: string;
}) {
  const [selectedChatId, setSelectedChatId] = useState<string | null>(
    initialChatId ?? null,
  );
  const {
    project,
    events,
    reviews,
    supervisorRuns,
    chats,
    messages,
    loading,
    error,
    notFound,
    refresh,
  } = useProject(id, selectedChatId);
  const { info } = useAppInfo();
  const router = useRouter();

  const [editor, setEditor] = useState<EditorState>(null);
  const [confirmStart, setConfirmStart] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pauseRequested, setPauseRequested] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
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

  // Sin `?chat=` se abre el chat más reciente: el composer nunca queda muerto.
  useEffect(() => {
    if (chats.length === 0) {
      setSelectedChatId(null);
      return;
    }

    setSelectedChatId((current) =>
      current && chats.some((chat) => chat.id === current)
        ? current
        : (chats[chats.length - 1]?.id ?? null),
    );
  }, [chats]);

  const availableAgents: AgentSpec[] = useMemo(() => {
    const connected = new Set(
      (info?.agents ?? [])
        .filter((agent) => agent.connected)
        .map((agent) => agent.provider),
    );

    return AGENT_CHOICES.map((choice) => choiceToAgent(choice.value)).filter(
      (agent) => connected.has(agent.provider),
    );
  }, [info]);

  const selectedChat = chats.find((chat) => chat.id === selectedChatId);

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
    attachments?: ProcessedAttachment[],
  ) {
    setBusy("message");
    setActionError(null);
    try {
      if (selectedChatId) {
        await api.sendChatMessage(id, selectedChatId, message, attachments);
      } else {
        // Un proyecto sin chats necesita uno: crearlo con el mensaje ya lo
        // envía, así que no se manda dos veces.
        const chat = await api.createChat(id, { message, attachments });
        setSelectedChatId(chat.id);
      }

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
        <div className="rounded-block border border-danger bg-danger-soft px-4 py-3 text-sm text-danger-text">
          {error}
        </div>
      </div>
    );
  }

  if (!project) return null;

  const isEditable = project.status === "ready";

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
        chatName={selectedChat?.title}
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
      />

      <ChatThread
        project={project}
        messages={messages}
        events={events}
        supervisorRuns={supervisorRuns}
        reviews={reviews}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onSelectTask={setSelectedTaskId}
        selectedTaskId={selectedTaskId}
        isEditable={isEditable}
        onAddTask={() => setEditor({ mode: "create" })}
        onEditTask={(taskId) => {
          const task = project.tasks.find((entry) => entry.id === taskId);
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
            setActionError(
              error instanceof Error ? error.message : String(error),
            );
          } finally {
            setBusy(null);
          }
        }}
        onResume={() => run("resume", () => api.resume(id))}
        onCancel={() => setConfirmCancel(true)}
        onRetryPlan={() => run("plan", () => api.generatePlan(id))}
      />

      <ThreadComposer
        status={project.status}
        onSendMessage={handleSendMessage}
        onPauseAndWrite={() => void requestPause()}
        allowedAgents={selectedChat?.allowedAgents}
        availableAgents={availableAgents}
        onUpdateAllowedAgents={handleUpdateAllowedAgents}
        loading={busy === "message"}
      />

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
        title="Ejecutar proyecto"
        width="max-w-md"
      >
        <p className="text-sm text-ink-3">
          La ejecución puede modificar código, crear commits y ejecutar tests en
          worktrees aislados. El resultado se deja en una rama aparte y nunca se
          integra automáticamente a <code className="font-mono">main</code>.
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
        title="Cancelar ejecución"
        width="max-w-md"
      >
        <p className="text-sm text-ink-3">
          Se detendrá la ejecución: las tareas en curso se interrumpen y no se
          lanzan nuevas. DeepSeek terminará su lote actual. El proyecto quedará
          cancelado.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setConfirmCancel(false)}>Seguir</Button>
          <Button
            variant="danger"
            loading={busy === "cancel"}
            onClick={() => {
              setConfirmCancel(false);
              void run("cancel", () => api.cancel(id));
            }}
          >
            Cancelar ejecución
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={confirmDelete}
        onClose={() => {
          setConfirmDelete(false);
          setDeleteConfirmName("");
        }}
        title="Borrar proyecto"
        width="max-w-md"
      >
        <p className="text-sm text-ink-3">
          Se borrará <span className="font-medium">{project.name}</span> de la
          app, junto con sus tareas, eventos y reviews. La carpeta en disco{" "}
          <span className="font-medium">no</span> se toca. Esta acción no se
          puede deshacer.
        </p>
        <label className="mt-4 block text-sm text-ink-3">
          Escribe <span className="font-mono text-ink-2">{project.name}</span>{" "}
          para confirmar:
          <input
            type="text"
            value={deleteConfirmName}
            onChange={(event) => setDeleteConfirmName(event.target.value)}
            className="mt-1.5 w-full rounded-btn border border-line-strong bg-surface px-3 py-2 font-mono text-sm text-ink outline-none focus:border-primary"
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            onClick={() => {
              setConfirmDelete(false);
              setDeleteConfirmName("");
            }}
          >
            Cancelar
          </Button>
          <Button
            variant="danger"
            loading={busy === "delete"}
            disabled={deleteConfirmName !== project.name}
            onClick={() => void deleteCurrentProject()}
          >
            Borrar proyecto
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
