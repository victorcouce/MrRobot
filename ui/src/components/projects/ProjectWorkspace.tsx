"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";
import { choiceToAgent, monoAgentLabel } from "../../lib/agents";
import { countLevels } from "../../lib/plan";
import { useProject, useAppInfo } from "../../lib/hooks";
import { PlayIcon } from "../ui/icons";
import type { ProjectBrief, Task } from "../../lib/types";
import { Button } from "../ui/Button";
import { LoadingState } from "../ui/Badge";
import { Dialog } from "../ui/Dialog";
import { ChatThread } from "./ChatThread";
import { GrillThread, GrillTranscript } from "./GrillThread";
import { ThreadComposer } from "./ThreadComposer";
import { ThreadHeader } from "./ThreadHeader";
import { TaskEditor, type TaskFormData } from "./TaskEditor";

type EditorState = { mode: "edit"; task: Task } | { mode: "create" } | null;

type ViewMode = "list" | "graph" | "board";

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex h-[30px] items-center justify-between border-b border-line-soft text-[13.5px]">
      <span className="text-ink-4">{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  );
}

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
    liveOutput,
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
  const [grillProjectId, setGrillProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (notFound) {
      router.replace("/");
    }
  }, [notFound, router]);

  // La entrevista de afinado es efímera: una vez mostrada se mantiene en el
  // hilo aunque el proyecto pase a `planning` o `ready`, para no perder la
  // conversación ni romper el orden cronológico. Se guarda el id para no
  // arrastrarla a otro proyecto.
  useEffect(() => {
    if (
      project &&
      project.id === id &&
      project.tasks.length === 0 &&
      (project.status === "draft" || project.status === "planning")
    ) {
      setGrillProjectId(project.id);
    }
  }, [project, id]);

  useEffect(() => {
    if (project?.status !== "running") {
      setPauseRequested(false);
    }
  }, [project?.status]);

  // Elegir otro chat del mismo proyecto en la barra lateral solo cambia `?chat=`:
  // la página no se remonta, así que se sigue la URL.
  useEffect(() => {
    if (initialChatId) setSelectedChatId(initialChatId);
  }, [initialChatId]);

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

  const selectedChat = chats.find((chat) => chat.id === selectedChatId);

  function handleStart() {
    if (project?.status === "draft") {
      void run("plan", () => api.generatePlan(id));
    } else {
      setConfirmStart(true);
    }
  }

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

  async function handleSendInstructions(taskId: string, instructions: string) {
    const outcome = await api.sendTaskInstructions(id, taskId, instructions);
    await refresh();
    return outcome;
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

  const isEditable =
    project.status === "ready" ||
    project.status === "paused" ||
    project.status === "blocked" ||
    project.status === "failed";
  const planLevels = countLevels(project.tasks);
  // Un proyecto recién creado nace en `draft` sin tareas: el hilo acoge la
  // entrevista de afinado antes de planificar. Mientras dura (también durante
  // `planning`) el composer y el arranque quedan bloqueados.
  const grillPhase =
    project.tasks.length === 0 &&
    (project.status === "draft" || project.status === "planning");
  const showGrill = grillProjectId === id || grillPhase;

  async function generatePlanFromGrill(
    instructions: string,
    brief: ProjectBrief,
  ) {
    setActionError(null);
    try {
      await api.generatePlan(id, instructions, brief);
      await refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

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
      {info?.mock && (
        <div
          role="status"
          className="flex h-9 shrink-0 items-center justify-center gap-2.5 border-b border-[#F1E2C4] bg-warning-soft text-[13px] text-[#6B4000]"
        >
          <span className="h-[7px] w-[7px] rounded-full bg-warning" />
          <span>
            <span className="font-semibold">Modo mock</span> · agentes y git
            simulados. No se gastan tokens.
          </span>
          <Link href="/settings" className="underline">
            Cómo salir
          </Link>
        </div>
      )}

      <ThreadHeader
        project={project}
        chatName={selectedChat?.title}
        onStart={grillPhase ? undefined : handleStart}
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
        liveOutput={liveOutput}
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
        onStart={handleStart}
        onPause={() => void requestPause()}
        onResume={() => run("resume", () => api.resume(id))}
        onCancel={() => setConfirmCancel(true)}
        onRetryPlan={() => run("plan", () => api.generatePlan(id))}
        onSendInstructions={handleSendInstructions}
        {...(showGrill
          ? {
              grillPanel: (
                <GrillThread
                  project={project}
                  onGeneratePlan={generatePlanFromGrill}
                />
              ),
            }
          : {
              briefPanel: (
                <GrillTranscript
                  goal={project.goal}
                  brief={project.brief}
                  attachments={project.attachments}
                />
              ),
            })}
      />

      {!grillPhase && (
        <ThreadComposer
          status={project.status}
          onSendMessage={handleSendMessage}
          onPauseAndWrite={() => void requestPause()}
          loading={busy === "message"}
        />
      )}

      {editor && (
        <TaskEditor
          mode={editor.mode}
          task={editor.mode === "edit" ? editor.task : undefined}
          tasks={project.tasks}
          allowedAgents={selectedChat?.allowedAgents}
          onClose={() => setEditor(null)}
          onSubmit={submitTask}
          submitting={busy === "task"}
          error={actionError}
        />
      )}

      <Dialog
        open={confirmStart}
        onClose={() => setConfirmStart(false)}
        title="Ejecutar el plan"
        description="Se lanzarán los agentes sobre worktrees aislados."
        width="max-w-lg"
        footer={
          <>
            <span />
            <div className="flex gap-2">
              <Button onClick={() => setConfirmStart(false)}>Cancelar</Button>
              <Button
                variant="primary"
                loading={busy === "start"}
                onClick={() => {
                  setConfirmStart(false);
                  void run("start", () => api.run(id));
                }}
              >
                <PlayIcon />
                Ejecutar
              </Button>
            </div>
          </>
        }
      >
        <div className="flex flex-col text-[13.5px]">
          <SummaryRow
            label="Tareas"
            value={`${project.stats.total} en ${planLevels} ${
              planLevels === 1 ? "nivel" : "niveles"
            }`}
          />
          <SummaryRow
            label="Agentes marcados"
            value={
              <span className="font-mono text-[12.5px]">
                {(selectedChat?.allowedAgents ?? [])
                  .map((agent) => monoAgentLabel(agent))
                  .join(", ") || "todos"}
              </span>
            }
          />
          <SummaryRow
            label="Concurrencia"
            value={`${project.config?.concurrency ?? "—"} a la vez`}
          />
          <SummaryRow
            label="Rama de destino"
            value={
              <span className="font-mono text-[12.5px]">
                agent/project-{project.name}-final
              </span>
            }
          />
        </div>
        <p className="text-[12.5px] text-ink-4">
          Mientras se ejecuta, los chats de este proyecto quedan en solo
          lectura.
        </p>
      </Dialog>

      <Dialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="¿Cancelar la ejecución?"
        description="Se detienen los procesos de codex y claude en curso. DeepSeek termina su lote actual."
        width="max-w-lg"
        footer={
          <div className="ml-auto flex gap-2">
            <Button onClick={() => setConfirmCancel(false)}>
              Seguir ejecutando
            </Button>
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
        }
      >
        <div className="rounded-[12px] bg-warning-soft px-3.5 py-3 text-[13px] leading-normal text-warning-text">
          Las {project.stats.running} tareas en curso se perderán. Las{" "}
          {project.stats.done} hechas se conservan y el proyecto queda Cancelado.
        </div>
      </Dialog>

      <Dialog
        open={confirmDelete}
        onClose={() => {
          setConfirmDelete(false);
          setDeleteConfirmName("");
        }}
        title={`¿Borrar ${project.name}?`}
        description={`Se elimina de MrRobot con sus chats, tareas y actividad.`}
        width="max-w-lg"
        footer={
          <div className="ml-auto flex gap-2">
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
        }
      >
        <div className="rounded-[12px] bg-sidebar px-3.5 py-3 text-[13px] leading-normal text-ink-2">
          Tu carpeta{" "}
          <span className="font-mono text-[12px]">
            {project.repoPath ?? "en disco"}
          </span>{" "}
          y sus ramas no se tocan.
        </div>
        <label className="flex flex-col gap-1.5 text-[12.5px] font-medium text-ink-2">
          Escribe{" "}
          <span className="font-mono text-ink">{project.name}</span> para
          confirmar
          <input
            type="text"
            value={deleteConfirmName}
            onChange={(event) => setDeleteConfirmName(event.target.value)}
            className="h-[38px] w-full rounded-btn border border-line-strong bg-surface px-3 font-mono text-[13.5px] font-normal text-ink outline-none focus:border-primary"
          />
        </label>
      </Dialog>
    </div>
  );
}
