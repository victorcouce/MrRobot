"use client";

import Link from "next/link";
import { useAppInfo, useProjects } from "@/lib/hooks";
import { LoadingState } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

function ConnectedDot({ connected }: { connected: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={
          connected
            ? "h-2 w-2 rounded-full bg-emerald-500"
            : "h-2 w-2 rounded-full bg-zinc-400"
        }
      />
      <span
        className={
          connected
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-zinc-400"
        }
      >
        {connected ? "Connected" : "Not connected"}
      </span>
    </span>
  );
}

export default function AgentsPage() {
  const { info } = useAppInfo();
  const { projects, loading } = useProjects();
  const running = projects.filter((project) => project.status === "running");

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="mb-6 text-xl font-semibold tracking-tight">Agents</h1>

      <section className="mb-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Availability
        </h2>
        {!info ? (
          <LoadingState label="Comprobando disponibilidad…" />
        ) : (
          <ul className="divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {info.agents.map((agent) => (
              <li
                key={agent.provider}
                className="flex items-center justify-between bg-white px-4 py-3 dark:bg-zinc-900"
              >
                <span className="text-sm font-medium">{agent.label}</span>
                <span className="flex items-center gap-3">
                  {!agent.connected && agent.reason && (
                    <span className="text-xs text-zinc-400">
                      {agent.reason}
                    </span>
                  )}
                  <ConnectedDot connected={agent.connected} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Active executions
        </h2>
        {loading ? (
          <LoadingState label="Cargando…" />
        ) : running.length === 0 ? (
          <EmptyState
            title="No hay ejecuciones activas"
            description="Los agentes activos aparecerán aquí cuando un proyecto esté en ejecución."
          />
        ) : (
          <ul className="space-y-2">
            {running.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
                >
                  <span className="text-sm font-medium">{project.name}</span>
                  <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
                    <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-blue-500" />
                    {project.stats.activeAgents} agent
                    {project.stats.activeAgents === 1 ? "" : "s"} active
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
