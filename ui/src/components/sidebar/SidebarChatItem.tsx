"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Pin } from "lucide-react";
import { clsx } from "@/lib/cx";
import { chatHref } from "@/lib/sidebar";
import type { ChatSummary } from "@/lib/types";
import { RenameInput } from "./RenameInput";
import { RowMenu, type MenuEntry, type RowMenuHandle } from "./RowMenu";
import { chatTitle } from "./useItemActions";

/** Tipo MIME propio para arrastrar un chat a un proyecto de la barra. */
export const CHAT_DRAG_TYPE = "application/x-mrrobot-chat";

export function SidebarChatItem({
  chat,
  active,
  nested,
  menu,
  onRename,
}: {
  chat: ChatSummary;
  active?: boolean;
  /** Dentro de un proyecto: fila más compacta. */
  nested?: boolean;
  menu: (actions: { onRename: () => void }) => MenuEntry[];
  onRename: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<RowMenuHandle>(null);
  const title = chatTitle(chat);

  return (
    <li
      className="group/chat relative"
      onContextMenu={(event) => {
        if (editing) return;
        event.preventDefault();
        menuRef.current?.openAt(event.clientX, event.clientY);
      }}
    >
      {editing ? (
        <div className={clsx("flex items-center px-1", nested ? "h-8" : "h-9")}>
          <RenameInput
            initial={title}
            label="Nuevo nombre del chat"
            onSave={(next) => {
              setEditing(false);
              onRename(next);
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <Link
          href={chatHref(chat)}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData(CHAT_DRAG_TYPE, chat.id);
            event.dataTransfer.effectAllowed = "move";
          }}
          aria-current={active ? "page" : undefined}
          title={title}
          className={clsx(
            "focus-ring flex items-center gap-2 rounded-btn pl-2.5 pr-2 transition-colors duration-100 group-hover/chat:pr-9 group-focus-within/chat:pr-9",
            nested ? "h-8 text-[12.5px]" : "h-9 text-[13px]",
            menuOpen && "pr-9",
            active
              ? "bg-muted font-medium text-ink"
              : clsx("hover:bg-muted hover:text-ink", nested ? "text-ink-3" : "text-ink-2", menuOpen && "bg-muted"),
          )}
        >
          <span className="min-w-0 flex-1 truncate">{title}</span>
          {chat.pinned && (
            <Pin
              className="h-3 w-3 shrink-0 text-ink-4 group-hover/chat:hidden"
              aria-label="Fijado"
            />
          )}
        </Link>
      )}
      {!editing && (
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
          <RowMenu
            ref={menuRef}
            label={`Opciones de ${title}`}
            items={menu({ onRename: () => setEditing(true) })}
            onOpenChange={setMenuOpen}
            triggerClassName="opacity-0 group-hover/chat:opacity-100 group-focus-within/chat:opacity-100"
          />
        </div>
      )}
    </li>
  );
}
