"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { api } from "../../lib/api";
import { useAllChats, useProjects } from "../../lib/hooks";
import { clsx } from "../../lib/cx";
import type { ChatSummary, ProjectSummary } from "../../lib/types";
import { ThemeToggle } from "./ThemeToggle";

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={clsx(
        "focus-ring flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium",
        active
          ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
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

function ProjectChatGroups() {
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

  if (recent.length === 0) {
    return (
      <p className="px-2.5 text-xs text-zinc-400 dark:text-zinc-500">
        Sin proyectos.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
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
                className="focus-ring flex min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
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
                className="focus-ring flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
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
                className="focus-ring ml-3 flex items-center gap-2 rounded-md px-2.5 py-1 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                <span className="truncate">{chat.title}</span>
                {chat.taskIds.length > 0 && (
                  <span className="ml-auto shrink-0 text-xs tabular-nums text-zinc-400">
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

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-60 shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex h-14 items-center gap-2 px-4">
          <span className="flex h-6 w-6 items-center justify-center rounded bg-accent text-xs font-bold text-accent-fg">
            M
          </span>
          <span className="text-sm font-semibold tracking-tight">MrRobot</span>
        </div>

        <nav className="space-y-0.5 px-3 py-2" aria-label="Principal">
          <NavLink href="/" active={pathname === "/" || pathname.startsWith("/projects")}>
            {NAV_ICONS.projects}
            Projects
          </NavLink>
          <NavLink href="/agents" active={pathname === "/agents"}>
            {NAV_ICONS.agents}
            Agents
          </NavLink>
          <NavLink href="/activity" active={pathname === "/activity"}>
            {NAV_ICONS.activity}
            Activity
          </NavLink>
        </nav>

        <div className="mt-4 flex-1 overflow-y-auto px-3">
          <p className="px-2.5 pb-1 text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            Projects & chats
          </p>
          <ProjectChatGroups />
        </div>

        <div className="space-y-0.5 border-t border-zinc-200 px-3 py-3 dark:border-zinc-800">
          <NavLink href="/settings" active={pathname === "/settings"}>
            {NAV_ICONS.settings}
            Settings
          </NavLink>
          <ThemeToggle />
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
