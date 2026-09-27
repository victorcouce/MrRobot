"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, FolderPlus, Layers } from "lucide-react";
import { clsx } from "@/lib/cx";
import { spaceIcon } from "@/lib/space-icons";
import type { Space } from "@/lib/types";

const OPTION_CLASS =
  "focus-ring grid h-9 w-full grid-cols-[16px_minmax(0,1fr)_14px] items-center gap-2.5 rounded-lg px-2 text-left text-[13px] text-ink hover:bg-sidebar";

export function SpaceSelector({
  spaces,
  current,
  onChange,
  onCreateNew,
}: {
  spaces: Space[];
  /** `null` = todos los espacios. */
  current: Space | null;
  onChange: (space: Space | null) => void;
  onCreateNew?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const CurrentIcon = current ? spaceIcon(current.icon) : Layers;

  function pick(space: Space | null) {
    onChange(space);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Espacio: ${current?.name ?? "Todos los espacios"}. Cambiar espacio`}
        title={current?.path}
        className={clsx(
          "focus-ring flex h-9 w-full items-center gap-2 rounded-btn px-2.5 text-left text-[13px] text-ink-2 transition-colors hover:bg-muted",
          open && "bg-muted",
        )}
      >
        <CurrentIcon className="h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          {current?.name ?? "Todos los espacios"}
        </span>
        <ChevronDown
          className={clsx(
            "h-3.5 w-3.5 shrink-0 text-ink-4 transition-transform duration-150",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div className="sidebar-reveal absolute left-0 right-0 top-full z-50 mt-1 rounded-[12px] border border-line-strong bg-surface p-1.5 shadow-modal">
          <ul role="listbox" aria-label="Espacios" className="max-h-[260px] overflow-y-auto">
            <li role="option" aria-selected={current === null}>
              <button type="button" onClick={() => pick(null)} className={OPTION_CLASS}>
                <Layers className="h-4 w-4" aria-hidden />
                <span className="truncate">Todos los espacios</span>
                {current === null && <Check className="h-3.5 w-3.5 text-ink-3" aria-hidden />}
              </button>
            </li>
            {spaces.map((space) => {
              const Icon = spaceIcon(space.icon);
              const selected = current?.id === space.id;
              return (
                <li key={space.id} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => pick(space)}
                    title={space.path}
                    className={OPTION_CLASS}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    <span className="truncate">{space.name}</span>
                    {selected && <Check className="h-3.5 w-3.5 text-ink-3" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>
          {onCreateNew && (
            <>
              <div className="mx-1 my-1 h-px bg-line" />
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onCreateNew();
                }}
                className={OPTION_CLASS}
              >
                <FolderPlus className="h-4 w-4" aria-hidden />
                <span className="truncate">Nuevo espacio</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
