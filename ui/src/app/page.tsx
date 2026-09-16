"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { useProjects } from "@/lib/hooks";
import { LoadingState } from "@/components/ui/Badge";

export default function ProjectsPage() {
  const { projects, error, loading } = useProjects();

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            Planifica y ejecuta proyectos multiagente.
          </p>
        </div>
        <Link href="/projects/new">
          <Button variant="primary">New Project</Button>
        </Link>
      </div>

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
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
