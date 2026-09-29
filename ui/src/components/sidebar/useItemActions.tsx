"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  FolderInput,
  FolderMinus,
  Link2,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import { api, type ChatPatch, type ProjectPatch } from "@/lib/api";
import { chatHref, projectLabel } from "@/lib/sidebar";
import { spaceIcon } from "@/lib/space-icons";
import type { ChatSummary, ProjectSummary } from "@/lib/types";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import type { MenuEntry } from "./RowMenu";

/** Mientras hay agentes trabajando no se ofrece borrar ni archivar el proyecto. */
export const BUSY_STATUSES = new Set(["planning", "running"]);

type PendingDelete =
  | { kind: "project"; project: ProjectSummary }
  | { kind: "chat"; chat: ChatSummary };

const ICON = "h-4 w-4";

export function chatTitle(chat: Pick<ChatSummary, "title">): string {
  return chat.title.trim() || "Nuevo chat";
}

/**
 * Acciones de chats y proyectos (menú «⋯», arrastrar a un proyecto, borrar
 * con confirmación). Si la acción saca de la vista lo que está abierto
 * (archivar, borrar, mover), navega a donde corresponde.
 */
export function useItemActions({ projects }: { projects: ProjectSummary[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeProjectId = pathname.match(/^\/projects\/([^/]+)$/)?.[1] ?? null;
  const activeChatId =
    pathname.match(/^\/chats\/([^/]+)$/)?.[1] ??
    (activeProjectId ? searchParams.get("chat") : null);

  // El aviso de error se va solo.
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(timer);
  }, [error]);

  const attempt = useCallback(async (fn: () => Promise<unknown>) => {
    try {
      setError(null);
      await fn();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    }
  }, []);

  const leaveChat = useCallback(
    (chat: ChatSummary) => {
      if (chat.id !== activeChatId) return;
      router.push(chat.projectId ? `/projects/${chat.projectId}` : "/");
    },
    [activeChatId, router],
  );

  const patchChat = useCallback(
    (chat: ChatSummary, patch: ChatPatch) =>
      attempt(async () => {
        const updated = await api.updateChat(chat.id, patch);
        if (patch.archived) leaveChat(chat);
        // Si el chat abierto cambia de sitio, su URL también.
        if (patch.projectId !== undefined && chat.id === activeChatId) {
          router.push(chatHref(updated));
        }
      }),
    [attempt, leaveChat, activeChatId, router],
  );

  const patchProject = useCallback(
    (project: ProjectSummary, patch: ProjectPatch) =>
      attempt(async () => {
        await api.updateProject(project.id, patch);
        if (patch.archived && project.id === activeProjectId) router.push("/");
      }),
    [attempt, activeProjectId, router],
  );

  const moveChat = useCallback(
    (chat: ChatSummary, projectId: string | null) => {
      if ((chat.projectId ?? null) === projectId) return Promise.resolve(true);
      return patchChat(chat, { projectId });
    },
    [patchChat],
  );

  const requestDelete = useCallback((target: PendingDelete) => {
    setDeleteError(null);
    setPendingDelete(target);
  }, []);

  async function copyLink(chat: ChatSummary) {
    try {
      await navigator.clipboard.writeText(
        new URL(chatHref(chat), window.location.origin).toString(),
      );
    } catch {
      setError("No se pudo copiar el enlace.");
    }
  }

  function chatMenu(
    chat: ChatSummary,
    { onRename }: { onRename?: () => void } = {},
  ): MenuEntry[] {
    const visible = projects.filter((project) => !project.archivedAt);
    const archived = Boolean(chat.archivedAt);

    const entries: MenuEntry[] = [
      {
        label: "Copiar enlace",
        icon: <Link2 className={ICON} aria-hidden />,
        onSelect: () => void copyLink(chat),
      },
    ];
    if (onRename) {
      entries.push({
        label: "Renombrar",
        icon: <Pencil className={ICON} aria-hidden />,
        onSelect: onRename,
      });
    }
    entries.push({
      kind: "submenu",
      label: "Mover a proyecto",
      icon: <FolderInput className={ICON} aria-hidden />,
      emptyLabel: "Aún no hay proyectos",
      items: visible.map((project) => {
        const Icon = spaceIcon(project.icon);
        return {
          id: project.id,
          label: projectLabel(project),
          icon: <Icon className={ICON} aria-hidden />,
          current: project.id === chat.projectId,
          onSelect: () => void moveChat(chat, project.id),
        };
      }),
    });
    if (chat.projectId) {
      entries.push({
        label: "Quitar del proyecto",
        icon: <FolderMinus className={ICON} aria-hidden />,
        onSelect: () => void moveChat(chat, null),
      });
    }
    if (!archived) {
      entries.push({
        label: chat.pinned ? "Desfijar chat" : "Fijar chat",
        icon: chat.pinned ? (
          <PinOff className={ICON} aria-hidden />
        ) : (
          <Pin className={ICON} aria-hidden />
        ),
        onSelect: () => void patchChat(chat, { pinned: !chat.pinned }),
      });
    }
    entries.push(
      {
        label: archived ? "Desarchivar" : "Archivar",
        icon: archived ? (
          <ArchiveRestore className={ICON} aria-hidden />
        ) : (
          <Archive className={ICON} aria-hidden />
        ),
        onSelect: () => void patchChat(chat, { archived: !archived }),
      },
      { kind: "separator" },
      {
        label: "Eliminar",
        icon: <Trash2 className={ICON} aria-hidden />,
        danger: true,
        onSelect: () => requestDelete({ kind: "chat", chat }),
      },
    );
    return entries;
  }

  function projectMenu(
    project: ProjectSummary,
    { onRename }: { onRename?: () => void } = {},
  ): MenuEntry[] {
    const busy = BUSY_STATUSES.has(project.status);
    const archived = Boolean(project.archivedAt);
    const entries: MenuEntry[] = [];

    if (onRename) {
      entries.push({
        label: "Renombrar",
        icon: <Pencil className={ICON} aria-hidden />,
        onSelect: onRename,
      });
    }
    if (!archived) {
      entries.push({
        label: project.pinned ? "Desfijar proyecto" : "Fijar proyecto",
        icon: project.pinned ? (
          <PinOff className={ICON} aria-hidden />
        ) : (
          <Pin className={ICON} aria-hidden />
        ),
        onSelect: () => void patchProject(project, { pinned: !project.pinned }),
      });
    }
    entries.push(
      {
        label: archived ? "Desarchivar" : "Archivar",
        icon: archived ? (
          <ArchiveRestore className={ICON} aria-hidden />
        ) : (
          <Archive className={ICON} aria-hidden />
        ),
        disabled: busy && !archived,
        hint: "Espera a que termine para archivarlo",
        onSelect: () => void patchProject(project, { archived: !archived }),
      },
      { kind: "separator" },
      {
        label: "Eliminar proyecto",
        icon: <Trash2 className={ICON} aria-hidden />,
        danger: true,
        disabled: busy,
        hint: "Espera a que termine para borrarlo",
        onSelect: () => requestDelete({ kind: "project", project }),
      },
    );
    return entries;
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      if (pendingDelete.kind === "project") {
        const { project } = pendingDelete;
        await api.deleteProject(project.id);
        if (project.id === activeProjectId) router.push("/");
      } else {
        const { chat } = pendingDelete;
        await api.deleteChatById(chat.id);
        leaveChat(chat);
      }
      setPendingDelete(null);
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setDeleting(false);
    }
  }

  const deleteTitle =
    pendingDelete?.kind === "project"
      ? `¿Eliminar «${projectLabel(pendingDelete.project)}»?`
      : pendingDelete
        ? `¿Eliminar «${chatTitle(pendingDelete.chat)}»?`
        : "";

  const deleteDescription =
    pendingDelete?.kind === "project"
      ? "Se elimina de MrRobot con sus chats, tareas y actividad. Tu carpeta y sus ramas no se tocan."
      : pendingDelete?.chat.projectId
        ? "Se eliminan el chat y sus mensajes, y las tareas que generó salen del plan."
        : "Se eliminan el chat y sus mensajes.";

  const dialogs: ReactNode = (
    <Dialog
      open={pendingDelete !== null}
      onClose={() => {
        if (!deleting) setPendingDelete(null);
      }}
      title={deleteTitle}
      description={deleteDescription}
      footer={
        <div className="ml-auto flex gap-2">
          <Button onClick={() => setPendingDelete(null)} disabled={deleting}>
            Cancelar
          </Button>
          <Button variant="danger" loading={deleting} onClick={() => void confirmDelete()}>
            Eliminar
          </Button>
        </div>
      }
    >
      {deleteError ? (
        <p role="alert" className="text-[13px] text-danger-text">
          {deleteError}
        </p>
      ) : null}
    </Dialog>
  );

  return {
    activeProjectId,
    activeChatId,
    error,
    dismissError: () => setError(null),
    chatMenu,
    projectMenu,
    renameChat: (chat: ChatSummary, title: string) => patchChat(chat, { title }),
    renameProject: (project: ProjectSummary, title: string) =>
      patchProject(project, { title }),
    patchChat,
    patchProject,
    moveChat,
    requestDelete,
    dialogs,
  };
}
