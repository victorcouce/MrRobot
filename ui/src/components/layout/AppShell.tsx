"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { Menu, SquarePen } from "lucide-react";
import { clsx } from "../../lib/cx";
import { usePersistentState } from "../../lib/sidebar";
import { Sidebar } from "../sidebar/Sidebar";
import { SidebarRail } from "../sidebar/SidebarRail";

const TOP_BUTTON_CLASS =
  "focus-ring flex h-9 w-9 items-center justify-center rounded-btn text-ink-3 hover:bg-muted hover:text-ink";

/** Cierra el cajón móvil cuando cambia la ruta o el chat abierto. */
function CloseOnNavigate({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  const chat = useSearchParams().get("chat");

  useEffect(() => {
    onNavigate();
  }, [pathname, chat, onNavigate]);

  return null;
}

export function AppShell({
  children,
  onNewChat,
  onNewProject,
  onOpenSearch,
}: {
  children: ReactNode;
  onNewChat?: () => void;
  onNewProject?: () => void;
  onOpenSearch?: () => void;
}) {
  const [collapsed, setCollapsed] = usePersistentState("mrrobot.sidebar.collapsed", false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Suspense fallback={null}>
        <CloseOnNavigate onNavigate={closeDrawer} />
      </Suspense>

      {drawerOpen && (
        <div
          className="sidebar-fade fixed inset-0 z-40 bg-ink/30 md:hidden"
          onClick={closeDrawer}
          aria-hidden
        />
      )}

      <aside
        aria-label="Barra lateral"
        className={clsx(
          "fixed inset-y-0 left-0 z-50 w-[272px] max-w-[85vw] shrink-0 border-r border-line bg-sidebar transition-transform duration-200 ease-out",
          "md:static md:z-auto md:w-[260px] md:max-w-none md:translate-x-0 md:transition-none",
          drawerOpen ? "translate-x-0 shadow-modal" : "-translate-x-full",
          collapsed && "md:hidden",
        )}
      >
        <Suspense fallback={null}>
          <Sidebar
            collapsed={collapsed}
            onNewChat={onNewChat}
            onNewProject={onNewProject}
            onOpenSearch={onOpenSearch}
            onNavigate={closeDrawer}
            onCollapse={() => {
              setDrawerOpen(false);
              setCollapsed(true);
            }}
          />
        </Suspense>
      </aside>

      {collapsed && (
        <aside
          aria-label="Barra lateral contraída"
          className="hidden w-16 shrink-0 border-r border-line bg-sidebar md:block"
        >
          <SidebarRail
            onExpand={() => setCollapsed(false)}
            onNewChat={onNewChat}
            onOpenSearch={onOpenSearch}
          />
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line bg-bg px-2 md:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir barra lateral"
            className={TOP_BUTTON_CLASS}
          >
            <Menu className="h-[18px] w-[18px]" aria-hidden />
          </button>
          <Link href="/" aria-label="Mr. Robot, inicio" className="focus-ring ml-1 flex items-center gap-2 rounded-btn">
            <Image src="/logo-mark.svg" alt="" width={22} height={22} className="h-[22px] w-[22px]" />
            <span className="font-display text-[14px] font-semibold text-ink">Mr. Robot</span>
          </Link>
          <button
            type="button"
            onClick={() => onNewChat?.()}
            aria-label="Nuevo chat"
            title="Nuevo chat"
            className={clsx(TOP_BUTTON_CLASS, "ml-auto")}
          >
            <SquarePen className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </div>

        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
