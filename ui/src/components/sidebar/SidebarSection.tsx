"use client";

import type { ReactNode } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { clsx } from "@/lib/cx";

export function SidebarSection({
  title,
  open,
  onToggle,
  onAdd,
  addLabel,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  /** Botón «+» que sustituye al contador al pasar el ratón. */
  onAdd?: () => void;
  addLabel?: string;
  children: ReactNode;
}) {
  const id = `sidebar-section-${title.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <section aria-label={title} className="mb-2">
      <div className="group relative">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={id}
          className="focus-ring flex h-7 w-full items-center gap-1 rounded-md px-2 text-[11px] font-semibold uppercase tracking-wide text-ink-4 hover:text-ink-2"
        >
          <span className="text-left">{title}</span>
          <ChevronRight
            className={clsx(
              "h-3.5 w-3.5 transition-transform duration-150 ease-out",
              open && "rotate-90",
            )}
            aria-hidden
          />
        </button>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            aria-label={addLabel}
            title={addLabel}
            className="focus-ring absolute right-1 top-0.5 flex h-6 w-6 items-center justify-center rounded-md text-ink-3 opacity-0 transition-opacity hover:bg-muted hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>
      {open && (
        <ul id={id} className="sidebar-reveal flex flex-col gap-px">
          {children}
        </ul>
      )}
    </section>
  );
}
