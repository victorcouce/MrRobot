"use client";

import Link from "next/link";
import { Suspense, useMemo } from "react";
import { ArchiveRestore, MessageCircle, Trash2 } from "lucide-react";
import { useAllChats, useProjects } from "@/lib/hooks";
import { chatHref, projectLabel } from "@/lib/sidebar";
import { spaceIcon } from "@/lib/space-icons";
import type { ChatSummary, ProjectSummary } from "@/lib/types";
import { chatTitle, useItemActions } from "@/components/sidebar/useItemActions";

const ACTION_CLASS =
  "focus-ring flex h-8 w-8 items-center justify-center rounded-btn text-ink-4 hover:bg-muted hover:text-ink";

function archivedDate(iso: string | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function Row({
  href,
  icon,
  title,
  detail,
  archivedAt,
  onRestore,
  onDelete,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  detail?: string;
  archivedAt?: string;
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-center gap-3 border-b border-line-soft px-2 py-2.5 last:border-0">
      <span className="text-ink-3">{icon}</span>
      <Link href={href} className="focus-ring min-w-0 flex-1 rounded-md">
        <span className="block truncate text-[14px] text-ink hover:underline">{title}</span>
        {detail && <span className="block truncate text-[12.5px] text-ink-4">{detail}</span>}
      </Link>
      <span className="hidden shrink-0 text-[12.5px] text-ink-4 sm:block">
        {archivedDate(archivedAt)}
      </span>
      <button
        type="button"
        onClick={onRestore}
        aria-label={`Desarchivar ${title}`}
        title="Desarchivar"
        className={ACTION_CLASS}
      >
        <ArchiveRestore className="h-4 w-4" aria-hidden />
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Eliminar ${title}`}
        title="Eliminar"
        className={ACTION_CLASS}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
    </li>
  );
}

function ArchivedContent() {
  const { projects, loading: loadingProjects } = useProjects();
  const { chats, loading: loadingChats } = useAllChats();
  const actions = useItemActions({ projects });

  const archivedProjects = useMemo(
    () =>
      projects
        .filter((project) => project.archivedAt)
        .sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? "")),
    [projects],
  );
  const archivedChats = useMemo(
    () =>
      chats
        .filter((chat) => chat.archivedAt)
        .sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? "")),
    [chats],
  );
  const names = useMemo(
    () => new Map(projects.map((project) => [project.id, projectLabel(project)])),
    [projects],
  );

  const loading = loadingProjects || loadingChats;
  const empty = archivedProjects.length === 0 && archivedChats.length === 0;

  return (
    <div className="mx-auto w-full max-w-[820px] px-6 py-10">
      <h1 className="font-display text-2xl font-medium text-ink">Archivados</h1>
      <p className="mt-1 text-[14px] text-ink-3">
        Lo archivado sale de la barra lateral sin borrarse. Desarchívalo para recuperarlo.
      </p>

      {actions.error && (
        <p role="alert" className="mt-4 rounded-btn border border-danger bg-danger-soft px-3 py-2 text-[13px] text-danger-text">
          {actions.error}
        </p>
      )}

      {!loading && empty && (
        <p className="mt-10 text-center text-[14px] text-ink-4">No tienes nada archivado.</p>
      )}

      {archivedProjects.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-4">
            Proyectos
          </h2>
          <ul className="rounded-[14px] border border-line bg-surface px-2">
            {archivedProjects.map((project: ProjectSummary) => {
              const Icon = spaceIcon(project.icon);
              return (
                <Row
                  key={project.id}
                  href={`/projects/${project.id}`}
                  icon={<Icon className="h-4 w-4" aria-hidden />}
                  title={projectLabel(project)}
                  detail={project.name}
                  {...(project.archivedAt ? { archivedAt: project.archivedAt } : {})}
                  onRestore={() => void actions.patchProject(project, { archived: false })}
                  onDelete={() => actions.requestDelete({ kind: "project", project })}
                />
              );
            })}
          </ul>
        </section>
      )}

      {archivedChats.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-4">
            Chats
          </h2>
          <ul className="rounded-[14px] border border-line bg-surface px-2">
            {archivedChats.map((chat: ChatSummary) => {
              const project = chat.projectId ? names.get(chat.projectId) : undefined;
              return (
                <Row
                  key={chat.id}
                  href={chatHref(chat)}
                  icon={<MessageCircle className="h-4 w-4" aria-hidden />}
                  title={chatTitle(chat)}
                  {...(project ? { detail: project } : {})}
                  {...(chat.archivedAt ? { archivedAt: chat.archivedAt } : {})}
                  onRestore={() => void actions.patchChat(chat, { archived: false })}
                  onDelete={() => actions.requestDelete({ kind: "chat", chat })}
                />
              );
            })}
          </ul>
        </section>
      )}

      {actions.dialogs}
    </div>
  );
}

export default function ArchivedPage() {
  return (
    <Suspense fallback={null}>
      <ArchivedContent />
    </Suspense>
  );
}
