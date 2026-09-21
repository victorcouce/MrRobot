"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAllChats, useAppInfo, useProjects } from "../../lib/hooks";
import type { ChatSummary, ProjectSummary } from "../../lib/types";
import { clsx } from "../../lib/cx";
import { PROJECT_STATUS } from "../../lib/status";
import { DOT_CLASSES } from "../ui/Badge";
import { Tooltip } from "../ui/Tooltip";

const NAV_ICONS: Record<string, ReactNode> = {
  agents: (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="5.5" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10.5" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M1.5 13.5c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5M6.5 13.5c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  activity: (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2 8h2l1.5-4 3 8L10 8h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  settings: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
      <circle cx="15" cy="6" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  ),
};

const SEARCH_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" strokeLinecap="round" />
  </svg>
);

const CHAT_RAIL_LIMIT = 12;

const CHAT_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path
      d="M2.5 4.5A2.5 2.5 0 0 1 5 2h6a2.5 2.5 0 0 1 2.5 2.5v3A2.5 2.5 0 0 1 11 10H7l-3.2 2.8V10A2.5 2.5 0 0 1 2.5 7.5z"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
  </svg>
);

function ProjectRail({
  pathname,
  projects,
}: {
  pathname: string;
  projects: ProjectSummary[];
}) {
  return (
    <nav aria-label="Proyectos" className="flex flex-col items-center gap-1.5">
      {projects.map((project) => {
        const isActive = pathname === `/projects/${project.id}`;
        const dotColor = DOT_CLASSES[PROJECT_STATUS[project.status].color];
        return (
          <Tooltip key={project.id} label={project.name}>
            <Link
              href={`/projects/${project.id}`}
              aria-label={project.name}
              className={clsx(
                "focus-ring relative flex h-10 w-10 items-center justify-center rounded-btn border bg-surface text-ink-2 hover:border-ink hover:text-ink",
                isActive ? "border-ink" : "border-line",
              )}
            >
              <span className="text-xs font-semibold">
                {project.name.substring(0, 2).toUpperCase()}
              </span>
              <span
                className={clsx("h-2 w-2 rounded-full absolute bottom-0 right-0", dotColor)}
              />
            </Link>
          </Tooltip>
        );
      })}
    </nav>
  );
}

function ChatRail({ chats }: { chats: ChatSummary[] }) {
  const recentChats = chats.slice(0, CHAT_RAIL_LIMIT);

  return (
    <nav aria-label="Chats" className="flex flex-col items-center gap-1.5">
      {recentChats.map((chat) => (
        <Tooltip key={chat.id} label={chat.title}>
          <Link
            href={`/projects/${chat.projectId}?chat=${chat.id}`}
            aria-label={chat.title}
            className="focus-ring flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-ink-2 hover:border-ink hover:text-ink"
          >
            {CHAT_ICON}
          </Link>
        </Tooltip>
      ))}
    </nav>
  );
}

function RailLabel({ children }: { children: ReactNode }) {
  return (
    <span className="w-16 select-none px-1 text-center text-[9px] font-semibold uppercase leading-none tracking-[0.08em] text-ink-4">
      {children}
    </span>
  );
}

function ProjectChatGroups({ pathname }: { pathname: string }) {
  const { projects } = useProjects();
  const { chats } = useAllChats();

  return (
    <div className="flex w-full flex-col items-center gap-1.5">
      <RailLabel>Proyectos</RailLabel>
      <ProjectRail pathname={pathname} projects={projects} />
      <div role="separator" className="my-1 h-px w-6 bg-line-strong" />
      <RailLabel>Chats</RailLabel>
      <ChatRail chats={chats} />
    </div>
  );
}

export function AppShell({
  children,
  onNewProject,
  onOpenSearch,
}: {
  children: ReactNode;
  onNewProject?: () => void;
  onOpenSearch?: () => void;
}) {
  const pathname = usePathname();
  const { info } = useAppInfo();
  const anyAgentConnected = (info?.agents ?? []).some((agent) => agent.connected);

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <aside className="flex w-16 shrink-0 flex-col overflow-hidden whitespace-nowrap border-r border-line bg-sidebar pt-3">
        <div className="flex h-12 w-16 items-center justify-center gap-2 px-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-btn bg-[#E1DFD8]">
            <Image
              src="/logo.png"
              alt="MrRobot"
              width={32}
              height={32}
              priority
              className="h-8 w-8 shrink-0"
            />
          </div>
        </div>

        <div className="mb-1.5 flex w-16 flex-col items-center gap-1.5 px-2">
          <Tooltip label="Nuevo proyecto">
            <button
              onClick={() => onNewProject?.()}
              className="focus-ring flex h-10 w-10 items-center justify-center rounded-btn text-ink hover:bg-muted"
              aria-label="Nuevo proyecto"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
            </button>
          </Tooltip>
          <Tooltip label="Buscar">
            <button
              onClick={() => onOpenSearch?.()}
              className="focus-ring flex h-10 w-10 items-center justify-center rounded-btn text-ink hover:bg-muted"
              aria-label="Buscar"
            >
              {SEARCH_ICON}
            </button>
          </Tooltip>
          <div className="h-px w-6 bg-line-strong" />
        </div>

        <div className="w-16 flex-1 overflow-y-auto px-2">
          <div className="mb-1.5" />
          <ProjectChatGroups pathname={pathname} />
        </div>

        <div className="flex w-16 flex-col items-center gap-1.5 px-2 py-3">
          <div className="h-px w-6 bg-line-strong" />
          <Tooltip label="Agentes">
            <Link
              href="/agents"
              aria-label="Agentes"
              className="focus-ring relative flex h-10 w-10 items-center justify-center rounded-btn text-ink-3 hover:bg-muted hover:text-ink-2"
            >
              {NAV_ICONS.agents}
              {anyAgentConnected && (
                <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-success" />
              )}
            </Link>
          </Tooltip>
          <Tooltip label="Actividad">
            <Link
              href="/activity"
              aria-label="Actividad"
              className="focus-ring flex h-10 w-10 items-center justify-center rounded-btn text-ink-3 hover:bg-muted hover:text-ink-2"
            >
              {NAV_ICONS.activity}
            </Link>
          </Tooltip>
          <Tooltip label="Ajustes">
            <Link
              href="/settings"
              aria-label="Ajustes"
              className="focus-ring flex h-10 w-10 items-center justify-center rounded-btn text-ink-3 hover:bg-muted hover:text-ink-2"
            >
              {NAV_ICONS.settings}
            </Link>
          </Tooltip>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
