"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import {
  Activity,
  Archive,
  PanelLeftOpen,
  Search,
  SlidersHorizontal,
  SquarePen,
  Users,
} from "lucide-react";
import { clsx } from "@/lib/cx";
import { useAllChats, useAppInfo, useProjects, useSpaces } from "@/lib/hooks";
import {
  groupChatsByProject,
  orderProjects,
  projectInSpace,
  projectLabel,
  usePersistentState,
} from "@/lib/sidebar";
import { spaceIcon } from "@/lib/space-icons";
import { PROJECT_STATUS } from "@/lib/status";
import { DOT_CLASSES } from "../ui/Badge";
import { Tooltip } from "../ui/Tooltip";
import { ProjectsPopup } from "./ProjectsPopup";

const RAIL_BUTTON_CLASS =
  "focus-ring relative flex h-10 w-10 items-center justify-center rounded-btn transition-colors duration-100";

function RailLink({
  href,
  label,
  active,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <Link
        href={href}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        className={clsx(
          RAIL_BUTTON_CLASS,
          active ? "bg-muted text-ink" : "text-ink-3 hover:bg-muted hover:text-ink",
        )}
      >
        {children}
      </Link>
    </Tooltip>
  );
}

/** Barra lateral contraída: solo iconos, con el nombre en un tooltip. */
export function SidebarRail({
  onExpand,
  onNewChat,
  onOpenSearch,
}: {
  onExpand: () => void;
  onNewChat?: () => void;
  onOpenSearch?: () => void;
}) {
  const pathname = usePathname();
  const { info } = useAppInfo();
  const { projects } = useProjects();
  const { chats } = useAllChats();
  const { spaces } = useSpaces();
  const [spaceId] = usePersistentState<string | null>("mrrobot.sidebar.space", null);

  const space = spaces.find((candidate) => candidate.id === spaceId) ?? null;
  const activeProjectId = pathname.match(/^\/projects\/([^/]+)$/)?.[1] ?? null;
  const anyAgentConnected = (info?.agents ?? []).some((agent) => agent.connected);

  // Mismo orden que la barra completa: fijados y luego por última actividad.
  const ordered = useMemo(
    () =>
      orderProjects(
        projects.filter((project) => projectInSpace(project, space)),
        groupChatsByProject(chats),
      ),
    [projects, chats, space],
  );

  return (
    <div className="flex h-full w-full flex-col items-center">
      <div className="flex h-14 shrink-0 items-center">
        <Tooltip label="Mostrar barra lateral">
          <button
            type="button"
            onClick={onExpand}
            aria-label="Mostrar barra lateral"
            className="focus-ring relative flex h-10 w-10 items-center justify-center rounded-btn group text-ink-3 hover:text-ink"
          >
            <Image
              src="/logo-mark.svg"
              alt=""
              width={32}
              height={32}
              priority
              className="h-8 w-8 group-hover:opacity-0 transition-opacity"
            />
            <PanelLeftOpen className="h-5 w-5 absolute opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden />
          </button>
        </Tooltip>
      </div>

      <div className="flex shrink-0 flex-col items-center gap-1 pb-2">
        <Tooltip label="Nuevo chat (⌘N)">
          <button
            type="button"
            onClick={() => onNewChat?.()}
            aria-label="Nuevo chat"
            className={clsx(RAIL_BUTTON_CLASS, "text-ink-3 hover:bg-muted hover:text-ink")}
          >
            <SquarePen className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </Tooltip>
        <Tooltip label="Buscar chats (⌘K)">
          <button
            type="button"
            onClick={() => onOpenSearch?.()}
            aria-label="Buscar chats"
            className={clsx(RAIL_BUTTON_CLASS, "text-ink-3 hover:bg-muted hover:text-ink")}
          >
            <Search className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </Tooltip>
      </div>

      <div className="h-px w-8 shrink-0 bg-line-strong" />

      <div className="flex justify-center py-2">
        <Tooltip label="Proyectos">
          <div className="flex h-10 w-10 items-center justify-center">
            <ProjectsPopup projects={projects} compact popupAlign="right" />
          </div>
        </Tooltip>
      </div>

      <div className="flex shrink-0 flex-col items-center gap-1 border-t border-line py-2">
        <RailLink href="/agents" label="Agentes" active={pathname === "/agents"}>
          <Users className="h-[18px] w-[18px]" aria-hidden />
          {anyAgentConnected && (
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-success" />
          )}
        </RailLink>
        <RailLink href="/activity" label="Actividad" active={pathname === "/activity"}>
          <Activity className="h-[18px] w-[18px]" aria-hidden />
        </RailLink>
        <RailLink href="/archived" label="Archivados" active={pathname === "/archived"}>
          <Archive className="h-[18px] w-[18px]" aria-hidden />
        </RailLink>
        <RailLink href="/settings" label="Ajustes" active={pathname === "/settings"}>
          <SlidersHorizontal className="h-[18px] w-[18px]" aria-hidden />
        </RailLink>
      </div>
    </div>
  );
}
