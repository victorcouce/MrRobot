"use client";

import Link from "next/link";
import { clsx } from "@/lib/cx";
import { spaceIcon } from "@/lib/space-icons";
import type { Space } from "@/lib/types";

/** Un proyecto (carpeta) de la barra lateral: lleva a su ventana principal. */
export function SidebarSpaceItem({
  space,
  href,
  active,
  onNavigate,
}: {
  space: Space;
  href: string;
  active?: boolean;
  onNavigate?: () => void;
}) {
  const Icon = spaceIcon(space.icon);

  return (
    <li className="sidebar-fade">
      <Link
        href={href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        title={space.path}
        className={clsx(
          "focus-ring flex h-9 items-center gap-2 rounded-btn px-2.5 text-[13px] transition-colors duration-100",
          active ? "bg-muted font-medium text-ink" : "text-ink-2 hover:bg-muted hover:text-ink",
        )}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{space.name}</span>
      </Link>
    </li>
  );
}
