"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { clsx } from "@/lib/cx";

export function SidebarSection({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const id = `sidebar-section-${title.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <section aria-label={title} className="mb-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
        className="focus-ring group flex h-7 w-full items-center gap-1 rounded-md px-2 text-[11px] font-semibold uppercase tracking-wide text-ink-4 hover:text-ink-2"
      >
        <span className="flex-1 text-left">{title}</span>
        <span className="font-normal tabular-nums opacity-0 transition-opacity group-hover:opacity-100">
          {count}
        </span>
        <ChevronRight
          className={clsx(
            "h-3.5 w-3.5 transition-transform duration-150 ease-out",
            open && "rotate-90",
          )}
          aria-hidden
        />
      </button>
      {open && (
        <ul id={id} className="sidebar-reveal flex flex-col gap-px">
          {children}
        </ul>
      )}
    </section>
  );
}
