"use client";

import Link from "next/link";
import { useActivity } from "@/lib/hooks";
import { describeEvent } from "@/lib/events";
import { clockTime, relativeTime } from "@/lib/format";
import { LoadingState } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

export default function ActivityPage() {
  const { events, error, loading } = useActivity();

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="mb-6 text-xl font-semibold tracking-tight">Activity</h1>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <LoadingState label="Cargando actividad…" />
      ) : events.length === 0 ? (
        <EmptyState
          title="Sin actividad"
          description="Crea y ejecuta un proyecto para ver eventos aquí."
        />
      ) : (
        <ol className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {events.map((event) => {
            const descriptor = describeEvent(event);
            return (
              <li
                key={event.id}
                className="flex items-center gap-3 bg-white px-4 py-2.5 dark:bg-zinc-900"
              >
                <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-zinc-400">
                  {clockTime(event.createdAt)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-zinc-800 dark:text-zinc-200">
                    {descriptor.title}
                  </div>
                  {descriptor.detail && (
                    <div className="truncate text-xs text-zinc-400">
                      {descriptor.detail}
                    </div>
                  )}
                </div>
                <Link
                  href={`/projects/${event.projectId}`}
                  className="shrink-0 text-xs text-zinc-400 hover:text-accent"
                >
                  {relativeTime(event.createdAt)}
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
