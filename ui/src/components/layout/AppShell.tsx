"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode, useEffect } from "react";
import { api } from "../../lib/api";
import { useAllChats, useProjects } from "../../lib/hooks";
import { clsx } from "../../lib/cx";
import type { ChatSummary, ProjectSummary } from "../../lib/types";
import { ThemeToggle } from "./ThemeToggle";

function NavLink({
  href,
  active,
  children,
  collapsed,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
  collapsed?: boolean;
}) {
  return (
    <Link
      href={href}
      className={clsx(
        "focus-ring flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
        collapsed ? "justify-center" : "",
        active
          ? "bg-muted text-ink dark:bg-zinc-800 dark:text-zinc-100"
          : "text-ink-3 hover:bg-muted hover:text-ink-2 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
      )}
    >
      {children}
    </Link>
  );
}

const NAV_ICONS: Record<string, ReactNode> = {
  projects: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.5" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9.5" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="1.5" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9.5" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  agents: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="5.5" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10.5" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M1.5 13.5c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5M6.5 13.5c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  activity: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2 8h2l1.5-4 3 8L10 8h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  settings: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
};

function ProjectChatGroups({ collapsed }: { collapsed: boolean }) {
  const { projects } = useProjects();
  const { chats, refresh } = useAllChats();
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chatsByProject = useMemo(() => {
    const map = new Map<string, ChatSummary[]>();

    for (const chat of chats) {
      const list = map.get(chat.projectId) ?? [];
      list.push(chat);
      map.set(chat.projectId, list);
    }

    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    }

    return map;
  }, [chats]);

  const recent = projects.slice(0, 5);

  async function createChat(project: ProjectSummary) {
    setBusyId(project.id);
    setError(null);
    try {
      const chat = await api.createChat(project.id, {});
      await refresh();
      router.push(`/projects/${project.id}?chat=${chat.id}`);
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : String(createError),
      );
    } finally {
      setBusyId(null);
    }
  }

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2">
        {recent.map((project) => {
          const isRunning = project.status === "running";
          const statusColor = clsx(
            "w-2 h-2 rounded-full",
            isRunning ? "bg-primary" : "bg-success",
          );
          return (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              title={project.name}
              className="focus-ring flex h-10 w-10 items-center justify-center rounded-btn border border-line text-ink-2 hover:border-ink hover:text-ink"
            >
              <span className="text-xs font-semibold">
                {project.name.substring(0, 2).toUpperCase()}
              </span>
              <span className={clsx(statusColor, "absolute bottom-0 right-0")} />
            </Link>
          );
        })}
      </div>
    );
  }

  if (recent.length === 0) {
    return (
      <p className="px-2.5 text-xs text-ink-4">
        Sin proyectos.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-md border border-danger bg-danger-soft px-2 py-1.5 text-xs text-danger-text">
          {error}
        </p>
      )}

      {recent.map((project) => {
        const projectChats = chatsByProject.get(project.id) ?? [];
        const isRunning = project.status === "running";
        const busy = busyId === project.id;

        return (
          <div key={project.id} className="space-y-0.5">
            <div className="flex items-center gap-0.5">
              <Link
                href={`/projects/${project.id}`}
                className="focus-ring flex min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium text-ink-2 hover:bg-muted hover:text-ink"
              >
                <span className="truncate">{project.name}</span>
              </Link>
              <button
                type="button"
                aria-label={`Nuevo chat en ${project.name}`}
                title={
                  isRunning
                    ? "Pausa el proyecto para crear un chat"
                    : "Nuevo chat"
                }
                disabled={isRunning || busy}
                onClick={() => void createChat(project)}
                className="focus-ring flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-4 transition-colors hover:bg-muted hover:text-ink-2 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path
                    d="M6 1.5v9M1.5 6h9"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            {projectChats.slice(0, 8).map((chat) => (
              <Link
                key={chat.id}
                href={`/projects/${project.id}?chat=${chat.id}`}
                className="focus-ring ml-3 flex items-center gap-2 rounded-md px-2.5 py-1 text-sm text-ink-3 hover:bg-muted hover:text-ink-2"
              >
                <span className="truncate">{chat.title}</span>
                {chat.taskIds.length > 0 && (
                  <span className="ml-auto shrink-0 text-xs tabular-nums text-ink-4">
                    {chat.taskIds.length}
                  </span>
                )}
              </Link>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("mrrobot-sidebar-collapsed");
    if (stored !== null) {
      setCollapsed(stored === "true");
    }
  }, []);

  const toggleCollapsed = () => {
    const newState = !collapsed;
    setCollapsed(newState);
    localStorage.setItem("mrrobot-sidebar-collapsed", String(newState));
  };

  if (!mounted) {
    return <div className="flex h-screen overflow-hidden" />;
  }

  const sidebarWidth = collapsed ? "w-16" : "w-[272px]";

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <aside
        className={clsx(
          "flex shrink-0 flex-col border-r border-line bg-sidebar transition-all duration-200",
          sidebarWidth,
        )}
      >
        <div
          className={clsx(
            "flex h-14 items-center gap-2 px-3",
            collapsed ? "justify-center" : "px-4",
          )}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded bg-ink text-xs font-bold text-surface">
            M
          </span>
          {!collapsed && (
            <span className="text-sm font-semibold tracking-tight text-ink">
              MrRobot
            </span>
          )}
        </div>

        <button
          onClick={toggleCollapsed}
          className="focus-ring mx-3 flex items-center justify-center rounded-btn border border-line bg-surface p-1.5 text-ink-3 hover:bg-muted hover:text-ink-2 mb-2"
          aria-label={collapsed ? "Expandir barra lateral" : "Contraer barra lateral"}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            {collapsed ? (
              <path d="M9 4v16M13 10l2 2-2 2" strokeLinecap="round" />
            ) : (
              <path d="M15 4v16M11 10l-2 2 2 2" strokeLinecap="round" />
            )}
          </svg>
        </button>

        {!collapsed && (
          <nav className="space-y-0.5 px-3 py-2" aria-label="Principal">
            <NavLink
              href="/projects"
              active={pathname === "/projects"}
              collapsed={collapsed}
            >
              {NAV_ICONS.projects}
              <span>Proyectos</span>
            </NavLink>
            <NavLink
              href="/agents"
              active={pathname === "/agents"}
              collapsed={collapsed}
            >
              {NAV_ICONS.agents}
              <span>Agentes</span>
            </NavLink>
            <NavLink
              href="/activity"
              active={pathname === "/activity"}
              collapsed={collapsed}
            >
              {NAV_ICONS.activity}
              <span>Actividad</span>
            </NavLink>
          </nav>
        )}

        <div className={clsx("flex-1 overflow-y-auto", collapsed ? "px-2" : "px-3")}>
          {!collapsed && (
            <>
              <p className="px-2.5 pb-2 text-xs font-semibold uppercase tracking-wider text-ink-4">
                Proyectos
              </p>
              <div className="mb-4">
                <button
                  onClick={() => (typeof window !== "undefined") && window.dispatchEvent(new CustomEvent("open-new-project"))}
                  className="focus-ring w-full flex items-center justify-center gap-2 rounded-btn bg-primary px-3 py-2 text-sm font-medium text-surface hover:bg-primary-hover"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                  </svg>
                  Nuevo proyecto
                </button>
              </div>
            </>
          )}
          {collapsed && <div className="mb-3" />}
          <ProjectChatGroups collapsed={collapsed} />
        </div>

        <div
          className={clsx(
            "border-t border-line py-3",
            collapsed ? "px-2 flex flex-col items-center gap-2" : "px-3 space-y-0.5",
          )}
        >
          {!collapsed && (
            <>
              <NavLink
                href="/settings"
                active={pathname === "/settings"}
                collapsed={collapsed}
              >
                {NAV_ICONS.settings}
                <span>Ajustes</span>
              </NavLink>
              <ThemeToggle />
            </>
          )}
          {collapsed && (
            <>
              <Link
                href="/settings"
                title="Ajustes"
                className="focus-ring flex h-8 w-8 items-center justify-center rounded-btn text-ink-3 hover:bg-muted hover:text-ink-2"
              >
                {NAV_ICONS.settings}
              </Link>
            </>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
