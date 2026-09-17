"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { TASK_STATUS } from "../../lib/status";
import type { ChatDetail, ChatSummary, Project } from "../../lib/types";
import { StatusBadge, LoadingState } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Textarea } from "../ui/Field";

export function ChatsPanel({
  project,
  chats,
  initialChatId,
  onRefresh,
}: {
  project: Project;
  chats: ChatSummary[];
  initialChatId?: string;
  onRefresh: () => Promise<void> | void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    initialChatId ?? null,
  );
  const [detail, setDetail] = useState<ChatDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isRunning = project.status === "running";

  useEffect(() => {
    if (initialChatId && chats.some((chat) => chat.id === initialChatId)) {
      setSelectedId(initialChatId);
    }
  }, [initialChatId, chats]);

  useEffect(() => {
    if (chats.length === 0) {
      setSelectedId(null);
      return;
    }

    if (!selectedId || !chats.some((chat) => chat.id === selectedId)) {
      setSelectedId(chats[0]?.id ?? null);
    }
  }, [chats, selectedId]);

  const loadDetail = useCallback(
    async (chatId: string) => {
      setLoadingDetail(true);
      try {
        setDetail(await api.getChat(project.id, chatId));
        setError(null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        setLoadingDetail(false);
      }
    },
    [project.id],
  );

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  async function createChat() {
    setCreating(true);
    setError(null);
    try {
      const chat = await api.createChat(project.id, {});
      await onRefresh();
      setSelectedId(chat.id);
      setDetail(chat);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
    } finally {
      setCreating(false);
    }
  }

  async function send() {
    if (!selectedId || !draft.trim()) return;
    setSending(true);
    setError(null);
    const content = draft.trim();
    setDraft("");

    try {
      const chat = await api.sendChatMessage(project.id, selectedId, content);
      setDetail(chat);
      await onRefresh();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : String(sendError));
      setDraft(content);
    } finally {
      setSending(false);
    }
  }

  async function removeChat(chatId: string) {
    setError(null);
    try {
      await api.deleteChat(project.id, chatId);
      if (selectedId === chatId) {
        setSelectedId(null);
        setDetail(null);
      }
      await onRefresh();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : String(removeError));
    }
  }

  const chatTasks = detail
    ? project.tasks.filter((task) => detail.taskIds.includes(task.id))
    : [];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr]">
      <aside className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Chats</h2>
          <Button
            size="sm"
            onClick={() => void createChat()}
            loading={creating}
            disabled={isRunning}
          >
            + New
          </Button>
        </div>

        {chats.length === 0 ? (
          <p className="rounded-md border border-dashed border-zinc-300 px-3 py-4 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            Aún no hay chats. Crea uno para planificar o iterar sobre el
            proyecto.
          </p>
        ) : (
          <ul className="space-y-1">
            {chats.map((chat) => (
              <li key={chat.id} className="group flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSelectedId(chat.id)}
                  className={
                    "focus-ring flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm transition-colors " +
                    (selectedId === chat.id
                      ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                      : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900")
                  }
                >
                  {chat.title}
                  <span className="ml-1 text-xs text-zinc-400">
                    ({chat.taskIds.length})
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Borrar chat ${chat.title}`}
                  onClick={() => void removeChat(chat.id)}
                  className="focus-ring rounded px-1 text-xs text-zinc-400 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="flex min-h-[320px] flex-col rounded-lg border border-zinc-200 dark:border-zinc-800">
        {error && (
          <div className="m-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        {!selectedId ? (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-zinc-500 dark:text-zinc-400">
            Selecciona o crea un chat.
          </div>
        ) : loadingDetail && !detail ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <LoadingState label="Cargando chat…" />
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {detail?.messages.length === 0 && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Describe qué quieres hacer. El planner propondrá tareas y las
                  añadirá al proyecto.
                </p>
              )}

              {detail?.messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.role === "user"
                      ? "ml-auto max-w-[85%] rounded-lg bg-accent px-3 py-2 text-sm text-accent-fg"
                      : "mr-auto max-w-[85%] rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                  }
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {message.taskIds.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {message.taskIds.map((taskId) => (
                        <span
                          key={taskId}
                          className="rounded bg-white/20 px-1.5 py-0.5 font-mono text-xs"
                        >
                          {taskId}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {chatTasks.length > 0 && (
              <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Tareas de este chat
                </h3>
                <ul className="space-y-1">
                  {chatTasks.map((task) => {
                    const status = TASK_STATUS[task.status];
                    return (
                      <li
                        key={task.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <StatusBadge label={status.label} color={status.color} />
                        <span className="font-mono text-xs text-zinc-400">
                          {task.id}
                        </span>
                        <span className="truncate">{task.title}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
              {isRunning ? (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  El proyecto se está ejecutando. Pausa o espera para seguir
                  iterando.
                </p>
              ) : (
                <div className="flex items-end gap-2">
                  <Textarea
                    aria-label="Mensaje"
                    rows={2}
                    value={draft}
                    placeholder="Escribe un mensaje…"
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                        event.preventDefault();
                        void send();
                      }
                    }}
                  />
                  <Button
                    variant="primary"
                    onClick={() => void send()}
                    loading={sending}
                    disabled={!draft.trim()}
                  >
                    Send
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
