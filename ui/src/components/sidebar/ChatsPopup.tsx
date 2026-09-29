"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MessageSquare, Search } from "lucide-react";
import { clsx } from "@/lib/cx";
import { chatHref } from "@/lib/sidebar";
import type { ChatSummary } from "@/lib/types";
import { chatTitle } from "./useItemActions";

const ROW_CLASS =
  "focus-ring flex h-9 w-full items-center gap-2.5 rounded-btn px-2.5 text-[13px] transition-colors duration-100";

/** Botón de chats de la barra contraída: al pasar el ratón lista los chats sin proyecto. */
export function ChatsPopup({
  chats,
  activeChatId,
}: {
  chats: ChatSummary[];
  activeChatId: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => () => clearTimeout(hoverTimeoutRef.current), []);

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? chats.filter((chat) => chatTitle(chat).toLowerCase().includes(needle))
    : chats;
  const active = chats.some((chat) => chat.id === activeChatId);

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={() => {
        hoverTimeoutRef.current = setTimeout(() => setIsOpen(true), 100);
      }}
      onMouseLeave={() => clearTimeout(hoverTimeoutRef.current)}
    >
      <button
        type="button"
        aria-label="Chats"
        aria-expanded={isOpen}
        className={clsx(
          "focus-ring flex h-9 w-9 items-center justify-center rounded-btn transition-colors duration-100",
          active ? "bg-muted text-ink" : "text-ink-2 hover:bg-muted hover:text-ink",
        )}
      >
        <MessageSquare className="h-4 w-4" aria-hidden />
      </button>

      {isOpen && (
        <div
          className="absolute left-full top-2 z-50 ml-2 w-72 rounded-lg border border-line bg-surface shadow-lg"
          onMouseEnter={() => clearTimeout(hoverTimeoutRef.current)}
          onMouseLeave={() => setIsOpen(false)}
        >
          <div className="flex flex-col gap-1 p-2">
            <div className="mb-1 flex items-center gap-2 rounded-lg bg-muted px-2 py-1.5">
              <Search className="h-4 w-4 text-ink-3" aria-hidden />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar…"
                className="flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-4"
              />
            </div>

            {chats.length === 0 && (
              <div className="px-2.5 py-2 text-[12.5px] text-ink-4">Aún no hay chats</div>
            )}
            {chats.length > 0 && visible.length === 0 && (
              <div className="px-2.5 py-2 text-[12.5px] text-ink-4">Ningún chat coincide</div>
            )}

            {visible.length > 0 && (
              <div className="max-h-64 overflow-y-auto border-t border-line pt-1">
                {visible.map((chat) => (
                  <Link
                    key={chat.id}
                    href={chatHref(chat)}
                    onClick={() => setIsOpen(false)}
                    className={clsx(
                      ROW_CLASS,
                      chat.id === activeChatId
                        ? "bg-primary-soft text-ink"
                        : "text-ink-2 hover:bg-muted hover:text-ink",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{chatTitle(chat)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
