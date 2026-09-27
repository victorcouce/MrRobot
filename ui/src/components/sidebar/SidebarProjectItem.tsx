"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, Pin } from "lucide-react";
import { clsx } from "@/lib/cx";
import { projectLabel } from "@/lib/sidebar";
import { spaceIcon } from "@/lib/space-icons";
import { PROJECT_STATUS } from "@/lib/status";
import type { ChatSummary, ProjectSummary } from "@/lib/types";
import { DOT_CLASSES } from "../ui/Badge";
import { Spinner } from "../ui/Button";
import { RenameInput } from "./RenameInput";
import { RowMenu, type MenuEntry, type RowMenuHandle } from "./RowMenu";
import { CHAT_DRAG_TYPE, SidebarChatItem } from "./SidebarChatItem";
import { BUSY_STATUSES } from "./useItemActions";

/** Chats visibles al desplegar un proyecto; el resto tras «Ver más». */
const CHAT_PREVIEW = 5;

function projectDetails(project: ProjectSummary): string {
  const { stats } = project;
  const lines = [
    project.goal,
    `${PROJECT_STATUS[project.status].label} · ${stats.done}/${stats.total} tareas`,
  ];
  if (stats.activeAgents > 0) {
    lines.push(
      `${stats.activeAgents} ${stats.activeAgents === 1 ? "agente activo" : "agentes activos"}`,
    );
  }
  if (project.repoPath) lines.push(project.repoPath);
  return lines.join("\n");
}

function StatusIndicator({ project }: { project: ProjectSummary }) {
  const meta = PROJECT_STATUS[project.status];
  const busy = BUSY_STATUSES.has(project.status);

  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center" title={meta.label}>
      {busy ? (
        <Spinner
          className={clsx(
            "h-3.5 w-3.5",
            project.status === "running" ? "text-blue-500" : "text-amber-500",
          )}
        />
      ) : (
        <span className={clsx("h-2 w-2 rounded-full", DOT_CLASSES[meta.color])} aria-hidden />
      )}
      <span className="sr-only">{meta.label}</span>
    </span>
  );
}

export function SidebarProjectItem({
  project,
  chats,
  active,
  activeChatId,
  menu,
  chatMenu,
  onRename,
  onRenameChat,
  onDropChat,
}: {
  project: ProjectSummary;
  chats: ChatSummary[];
  active?: boolean;
  activeChatId?: string | null;
  menu: (actions: { onRename: () => void }) => MenuEntry[];
  chatMenu: (chat: ChatSummary, actions: { onRename: () => void }) => MenuEntry[];
  onRename: (title: string) => void;
  onRenameChat: (chat: ChatSummary, title: string) => void;
  /** Un chat arrastrado desde la barra se suelta sobre el proyecto. */
  onDropChat: (chatId: string) => void;
}) {
  const [expanded, setExpanded] = useState(Boolean(active));
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropping, setDropping] = useState(false);
  const menuRef = useRef<RowMenuHandle>(null);
  const Icon = spaceIcon(project.icon);
  const label = projectLabel(project);

  // Al abrir un proyecto (desde la barra o desde otra página) se despliegan sus chats.
  useEffect(() => {
    if (active) setExpanded(true);
  }, [active]);

  // El chat abierto siempre se ve, aunque esté más allá de los primeros.
  const activeIndex = chats.findIndex((chat) => chat.id === activeChatId);
  const limit = showAll ? chats.length : Math.max(CHAT_PREVIEW, activeIndex + 1);
  const visible = chats.slice(0, limit);
  const hidden = chats.length - visible.length;

  return (
    <li className="sidebar-fade">
      <div
        className={clsx(
          "group/project relative rounded-btn",
          dropping && "bg-primary-soft ring-2 ring-primary",
        )}
        onContextMenu={(event) => {
          if (editing) return;
          event.preventDefault();
          menuRef.current?.openAt(event.clientX, event.clientY);
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes(CHAT_DRAG_TYPE)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(event) => {
          setDropping(false);
          const chatId = event.dataTransfer.getData(CHAT_DRAG_TYPE);
          if (!chatId) return;
          event.preventDefault();
          setExpanded(true);
          onDropChat(chatId);
        }}
      >
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Ocultar" : "Mostrar"} chats de ${label}`}
          className="focus-ring absolute left-1 top-1/2 z-10 flex h-6 w-5 -translate-y-1/2 items-center justify-center rounded-md text-ink-4 hover:text-ink"
        >
          <ChevronRight
            className={clsx(
              "h-3.5 w-3.5 transition-transform duration-150 ease-out",
              expanded && "rotate-90",
            )}
            aria-hidden
          />
        </button>
        {editing ? (
          <div className="flex h-9 items-center gap-2 pl-7 pr-1">
            <Icon className="h-4 w-4 shrink-0 text-ink-2" aria-hidden />
            <RenameInput
              initial={label}
              label="Nuevo nombre del proyecto"
              onSave={(next) => {
                setEditing(false);
                onRename(next);
              }}
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : (
          <Link
            href={`/projects/${project.id}`}
            aria-current={active && !activeChatId ? "page" : undefined}
            title={projectDetails(project)}
            className={clsx(
              "focus-ring flex h-9 items-center gap-2 rounded-btn pl-7 pr-2 text-[13px] transition-colors duration-100",
              "group-hover/project:pr-9 group-focus-within/project:pr-9",
              menuOpen && "bg-muted pr-9",
              active ? "bg-muted font-medium text-ink" : "text-ink-2 hover:bg-muted hover:text-ink",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {project.pinned && (
              <Pin className="h-3 w-3 shrink-0 text-ink-4" aria-label="Fijado" />
            )}
            <span className={clsx(!menuOpen && "group-hover/project:hidden group-focus-within/project:hidden", menuOpen && "hidden")}>
              <StatusIndicator project={project} />
            </span>
          </Link>
        )}
        {!editing && (
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
            <RowMenu
              ref={menuRef}
              label={`Opciones de ${label}`}
              items={menu({ onRename: () => setEditing(true) })}
              onOpenChange={setMenuOpen}
              triggerClassName="opacity-0 group-hover/project:opacity-100 group-focus-within/project:opacity-100"
            />
          </div>
        )}
      </div>

      {expanded && (
        <ul
          aria-label={`Chats de ${label}`}
          className="sidebar-reveal ml-[18px] flex flex-col gap-px border-l border-line pl-1.5"
        >
          {chats.length === 0 ? (
            <li className="px-2 py-1.5 text-[12px] text-ink-4">Sin chats aún</li>
          ) : (
            visible.map((chat) => (
              <SidebarChatItem
                key={chat.id}
                chat={chat}
                nested
                active={chat.id === activeChatId}
                menu={(actions) => chatMenu(chat, actions)}
                onRename={(title) => onRenameChat(chat, title)}
              />
            ))
          )}
          {(hidden > 0 || (showAll && chats.length > CHAT_PREVIEW)) && (
            <li>
              <button
                type="button"
                onClick={() => setShowAll((value) => !value)}
                className="focus-ring flex h-7 w-full items-center rounded-md px-2.5 text-[12px] text-ink-4 hover:bg-muted hover:text-ink"
              >
                {showAll ? "Ver menos" : `Ver más (${hidden})`}
              </button>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}
