"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, MessageCircle } from "lucide-react";
import { clsx } from "@/lib/cx";
import { spaceIcon } from "@/lib/space-icons";
import type { Space } from "@/lib/types";

interface SpacePickerProps {
  spaces: Space[];
  selected: Space | null;
  onSelect: (space: Space) => void;
  onCreateNew: () => void;
  /** Vuelve a «sin proyecto»: el mensaje abre un chat suelto. */
  onClear?: () => void;
  /** Se abre solo al llegar desde «Nuevo proyecto». */
  autoOpen?: boolean;
  /** Resalta el botón cuando se intenta planificar sin proyecto. */
  invalid?: boolean;
  shake?: boolean;
  onShakeEnd?: () => void;
}

export function SpacePicker({
  spaces,
  selected,
  onSelect,
  onCreateNew,
  onClear,
  autoOpen,
  invalid,
  shake,
  onShakeEnd,
}: SpacePickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (autoOpen) setIsOpen(true);
  }, [autoOpen]);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
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

  useEffect(() => {
    if (!isOpen) setQuery("");
  }, [isOpen]);

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? spaces.filter(
        (space) =>
          space.name.toLowerCase().includes(needle) ||
          ("path" in space && space.path.toLowerCase().includes(needle)),
      )
    : spaces;

  const SelectedIcon = spaceIcon(selected?.icon);

  return (
    <div ref={containerRef} className="relative inline-block min-w-0">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={
          selected ? `Proyecto: ${selected.name}. Cambiar proyecto` : "Seleccionar proyecto"
        }
        title={"path" in (selected ?? {}) ? (selected as any).path : selected?.name}
        onAnimationEnd={onShakeEnd}
        className={clsx(
          "focus-ring flex h-[34px] max-w-[240px] items-center gap-[7px] rounded-btn border px-2.5 text-[13px] text-ink-2 transition-colors hover:bg-muted",
          invalid ? "border-ink ring-1 ring-ink/20" : "border-transparent",
          isOpen && "bg-muted",
          shake && "shake-x",
        )}
      >
        <SelectedIcon className="h-[15px] w-[15px] shrink-0" strokeWidth={1.8} aria-hidden />
        <span className="truncate">{selected?.name ?? "Proyecto"}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-ink-4" strokeWidth={2} aria-hidden />
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Proyectos"
          className="absolute bottom-full left-0 z-50 mb-2.5 w-[300px] rounded-[14px] border border-line-strong bg-surface p-2 shadow-modal"
        >
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar proyectos…"
            aria-label="Buscar proyectos"
            className="mb-1 h-9 w-full rounded-lg bg-transparent px-2 text-[13px] text-ink outline-none placeholder:text-ink-4"
          />

          <ul className="max-h-[280px] overflow-y-auto">
            {visible.map((space) => {
              const Icon = spaceIcon(space.icon);
              const isSelected = selected?.id === space.id;
              return (
                <li key={space.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(space);
                      setIsOpen(false);
                    }}
                    title={space.path}
                    aria-current={isSelected || undefined}
                    className="focus-ring grid h-[38px] w-full grid-cols-[16px_minmax(0,1fr)_14px] items-center gap-2.5 rounded-lg px-2 text-left text-[13px] text-ink hover:bg-sidebar"
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    <span className="truncate">{space.name}</span>
                    {isSelected && <Check className="h-3.5 w-3.5 text-ink-3" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>

          {spaces.length > 0 && visible.length === 0 && (
            <p className="px-2 py-2 text-xs text-ink-4">Ningún proyecto coincide.</p>
          )}

          {onClear && selected && (
            <div aria-hidden className="mx-1.5 my-1 h-px bg-line-soft" />
          )}

          {onClear && selected && (
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onClear();
              }}
              className="focus-ring flex h-[38px] w-full items-center gap-2.5 rounded-lg px-2 text-left text-[13px] text-ink hover:bg-sidebar"
            >
              <MessageCircle className="h-4 w-4 shrink-0" aria-hidden />
              Sin proyecto (solo chat)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
