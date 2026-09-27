"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  Archive,
  PanelLeftClose,
  Search,
  SlidersHorizontal,
  SquarePen,
  Users,
  X,
} from "lucide-react";
import { clsx } from "@/lib/cx";
import { useAllChats, useAppInfo, useProjects, useSpaces } from "@/lib/hooks";
import {
  groupChatsByProject,
  looseChats,
  orderProjects,
  projectInSpace,
  usePersistentState,
} from "@/lib/sidebar";
import { NewSpaceDialog } from "../spaces/NewSpaceDialog";
import { CHAT_DRAG_TYPE, SidebarChatItem } from "./SidebarChatItem";
import { ProjectsPopup } from "./ProjectsPopup";
import { SidebarSection } from "./SidebarSection";
import { SpaceSelector } from "./SpaceSelector";
import { useItemActions } from "./useItemActions";

const OPEN_SECTIONS = { chats: true };

const ROW_CLASS =
  "focus-ring flex h-9 w-full items-center gap-2.5 rounded-btn px-2.5 text-[13px] transition-colors duration-100";

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="ml-auto font-sans text-[11.5px] text-ink-4 opacity-0 transition-opacity group-hover/row:opacity-100">
      {children}
    </kbd>
  );
}

function FooterLink({
  href,
  label,
  icon,
  active,
  badge,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  badge?: ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={clsx(
        ROW_CLASS,
        "relative",
        active ? "bg-muted text-ink" : "text-ink-3 hover:bg-muted hover:text-ink",
      )}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {badge}
    </Link>
  );
}

export function Sidebar({
  collapsed = false,
  onNewChat,
  onNewProject,
  onOpenSearch,
  onNavigate,
  onCollapse,
}: {
  collapsed?: boolean;
  onNewChat?: () => void;
  onNewProject?: () => void;
  onOpenSearch?: () => void;
  /** Se llama al navegar: en móvil cierra el cajón. */
  onNavigate?: () => void;
  onCollapse?: () => void;
}) {
  const pathname = usePathname();
  const { info } = useAppInfo();
  const { projects } = useProjects();
  const { chats } = useAllChats();
  const { spaces } = useSpaces();
  const [spaceId, setSpaceId] = usePersistentState<string | null>(
    "mrrobot.sidebar.space",
    null,
  );
  const [sections, setSections] = usePersistentState(
    "mrrobot.sidebar.sections.v2",
    OPEN_SECTIONS,
  );
  const [newSpaceOpen, setNewSpaceOpen] = useState(false);
  const [droppingOnChats, setDroppingOnChats] = useState(false);
  const actions = useItemActions({ projects });

  const anyAgentConnected = (info?.agents ?? []).some((agent) => agent.connected);
  // Si el espacio guardado ya no existe se muestran todos.
  const space = spaces.find((candidate) => candidate.id === spaceId) ?? null;

  const chatsByProject = useMemo(() => groupChatsByProject(chats), [chats]);
  const ordered = useMemo(
    () =>
      orderProjects(
        projects.filter((project) => projectInSpace(project, space)),
        chatsByProject,
      ),
    [projects, space, chatsByProject],
  );
  const loose = useMemo(() => looseChats(chats), [chats]);

  function chatById(id: string) {
    return chats.find((chat) => chat.id === id);
  }

  function run(fn?: () => void) {
    fn?.();
    onNavigate?.();
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2 px-3">
        <Link
          href="/"
          onClick={onNavigate}
          aria-label="Mr. Robot, inicio"
          className="focus-ring flex min-w-0 flex-1 items-center gap-2 rounded-btn"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
            <Image src="/logo-mark.svg" alt="" width={32} height={32} priority className="h-8 w-8" />
          </span>
          <span className="truncate font-display text-[15px] font-semibold text-ink">Mr. Robot</span>
        </Link>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Ocultar barra lateral"
            title="Ocultar barra lateral"
            className="focus-ring flex h-8 w-8 items-center justify-center rounded-btn text-ink-4 hover:bg-muted hover:text-ink"
          >
            <PanelLeftClose className="h-[18px] w-[18px]" aria-hidden />
          </button>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-px px-2 pb-2">
        <button
          type="button"
          onClick={() => run(onNewChat)}
          className={clsx(ROW_CLASS, "group/row text-ink-2 hover:bg-muted hover:text-ink")}
        >
          <SquarePen className="h-4 w-4" aria-hidden />
          Nuevo chat
          <Kbd>⌘N</Kbd>
        </button>
        <button
          type="button"
          onClick={() => run(onOpenSearch)}
          className={clsx(ROW_CLASS, "group/row text-ink-2 hover:bg-muted hover:text-ink")}
        >
          <Search className="h-4 w-4" aria-hidden />
          Buscar chats
          <Kbd>⌘K</Kbd>
        </button>
      </div>

      <nav aria-label="Proyectos y chats" className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <div className="flex flex-col gap-2">
          <ProjectsPopup
            projects={ordered}
            chatsByProject={chatsByProject}
            activeProjectId={actions.activeProjectId}
            onNewProject={() => run(onNewProject)}
            onNavigate={onNavigate}
            compact={collapsed}
          />

          {spaces.length > 0 && (
            <div className="px-2.5 py-2">
              <SpaceSelector
                spaces={spaces}
                current={space}
                onChange={(next) => setSpaceId(next?.id ?? null)}
                onCreateNew={() => setNewSpaceOpen(true)}
              />
            </div>
          )}
        </div>

        {loose.length > 0 && (
          <div
            className={clsx("rounded-btn", droppingOnChats && "bg-primary-soft ring-2 ring-primary")}
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes(CHAT_DRAG_TYPE)) return;
              event.preventDefault();
              setDroppingOnChats(true);
            }}
            onDragLeave={() => setDroppingOnChats(false)}
            onDrop={(event) => {
              setDroppingOnChats(false);
              const chat = chatById(event.dataTransfer.getData(CHAT_DRAG_TYPE));
              if (!chat) return;
              event.preventDefault();
              void actions.moveChat(chat, null);
            }}
          >
            <SidebarSection
              title="Chats"
              count={loose.length}
              open={sections.chats !== false}
              onToggle={() => setSections({ ...sections, chats: sections.chats === false })}
            >
              {loose.map((chat) => (
                <SidebarChatItem
                  key={chat.id}
                  chat={chat}
                  active={chat.id === actions.activeChatId}
                  menu={(rowActions) => actions.chatMenu(chat, rowActions)}
                  onRename={(title) => void actions.renameChat(chat, title)}
                />
              ))}
            </SidebarSection>
          </div>
        )}
      </nav>

      {actions.error && (
        <div
          role="alert"
          className="sidebar-fade mx-2 mb-2 flex items-start gap-2 rounded-btn border border-danger bg-danger-soft px-2.5 py-2 text-[12.5px] leading-snug text-danger-text"
        >
          <span className="flex-1">{actions.error}</span>
          <button
            type="button"
            onClick={actions.dismissError}
            aria-label="Cerrar aviso"
            className="focus-ring -mr-1 rounded-md p-0.5 hover:bg-danger/10"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      )}

      <div className="flex shrink-0 flex-col gap-px border-t border-line px-2 py-2">
        <FooterLink
          href="/agents"
          label="Agentes"
          icon={<Users className="h-4 w-4" aria-hidden />}
          active={pathname === "/agents"}
          onNavigate={onNavigate}
          badge={
            anyAgentConnected ? (
              <span className="h-1.5 w-1.5 rounded-full bg-success" title="Hay agentes conectados" />
            ) : undefined
          }
        />
        <FooterLink
          href="/activity"
          label="Actividad"
          icon={<Activity className="h-4 w-4" aria-hidden />}
          active={pathname === "/activity"}
          onNavigate={onNavigate}
        />
        <FooterLink
          href="/archived"
          label="Archivados"
          icon={<Archive className="h-4 w-4" aria-hidden />}
          active={pathname === "/archived"}
          onNavigate={onNavigate}
        />
        <FooterLink
          href="/settings"
          label="Ajustes"
          icon={<SlidersHorizontal className="h-4 w-4" aria-hidden />}
          active={pathname === "/settings"}
          onNavigate={onNavigate}
        />
      </div>

      {actions.dialogs}

      <NewSpaceDialog
        open={newSpaceOpen}
        onClose={() => setNewSpaceOpen(false)}
        onCreated={(created) => {
          setNewSpaceOpen(false);
          setSpaceId(created.id);
        }}
      />
    </div>
  );
}
