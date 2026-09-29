"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { clsx } from "@/lib/cx";
import { spaceIcon } from "@/lib/space-icons";
import type { Space } from "@/lib/types";

/** Un proyecto (carpeta) de la barra lateral; al desplegarlo lista sus objetivos. */
export function SidebarSpaceItem({
  space,
  active,
  children,
}: {
  space: Space;
  active?: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(Boolean(active));
  const Icon = spaceIcon(space.icon);

  useEffect(() => {
    if (active) setExpanded(true);
  }, [active]);

  return (
    <li className="sidebar-fade">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        title={space.path}
        className="focus-ring flex h-9 w-full items-center gap-2 rounded-btn pl-2 pr-2 text-[13px] text-ink-2 transition-colors duration-100 hover:bg-muted hover:text-ink"
      >
        <ChevronRight
          className={clsx(
            "h-3.5 w-3.5 shrink-0 text-ink-4 transition-transform duration-150 ease-out",
            expanded && "rotate-90",
          )}
          aria-hidden
        />
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-left">{space.name}</span>
      </button>
      {expanded && (
        <ul className="ml-4 flex flex-col gap-px border-l border-line pl-1">{children}</ul>
      )}
    </li>
  );
}
