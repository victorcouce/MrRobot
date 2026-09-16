"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { ImportProjectDialog } from "@/components/projects/ImportProjectDialog";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { useProjects } from "@/lib/hooks";
import { api } from "@/lib/api";
import { LoadingState } from "@/components/ui/Badge";
import type { ProjectSummary } from "@/lib/types";

export default function ProjectsPage() {
  const { projects, error, loading, refresh } = useProjects();
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteProject(deleteTarget.id);
      setDeleteTarget(null);
      await refresh();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : String(error));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            Planifica y ejecuta proyectos multiagente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setImportOpen(true)}>
            Import
          </Button>
          <Link href="/projects/new">
            <Button variant="primary">New Project</Button>
          </Link>
        </div>
      </div>

      <ImportProjectDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
      />

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <LoadingState label="Cargando proyectos…" />
      ) : projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create your first project and let MrRobot plan and execute the work."
          action={
            <Link href="/projects/new">
              <Button variant="primary">New Project</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      <Dialog
        open={deleteTarget !== null}
        onClose={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        title="Borrar proyecto"
        width="max-w-md"
      >
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Se borrará{" "}
          <span className="font-medium">{deleteTarget?.name}</span> de la app,
          junto con sus tareas, eventos y reviews. El directorio en disco{" "}
          <span className="font-medium">no</span> se toca.
        </p>
        {deleteError && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {deleteError}
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button
            onClick={() => {
              setDeleteTarget(null);
              setDeleteError(null);
            }}
          >
            Cancelar
          </Button>
          <Button
            variant="danger"
            loading={deleting}
            onClick={() => void confirmDelete()}
          >
            Borrar proyecto
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
