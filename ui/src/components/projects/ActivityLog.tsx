"use client";

import { useMemo, useState } from "react";
import type { ProjectEvent } from "../../lib/types";
import { describeEvent, EVENT_CATEGORIES, type EventCategory } from "../../lib/events";
import { clockTime } from "../../lib/format";
import { clsx } from "../../lib/cx";

export function ActivityLog({ events }: { events: ProjectEvent[] }) {
  const [category, setCategory] = useState<EventCategory | "all">("all");

  const filtered = useMemo(() => {
    const sorted = [...events].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    if (category === "all") return sorted;
    return sorted.filter((event) => describeEvent(event).category === category);
  }, [events, category]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1">
        {EVENT_CATEGORIES.map((item) => (
          <button
            key={item.id}
            onClick={() => setCategory(item.id)}
            className={clsx(
              "focus-ring rounded-md px-2.5 py-1 text-xs font-medium",
              category === item.id
                ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100"
                : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">Sin actividad.</p>
      ) : (
        <ol className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {filtered.map((event) => {
            const descriptor = describeEvent(event);
            return (
              <li key={event.id} className="flex gap-3 py-2.5">
                <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-zinc-400">
                  {clockTime(event.createdAt)}
                </span>
                <div className="min-w-0">
                  <div className="text-sm text-zinc-800 dark:text-zinc-200">
                    {descriptor.title}
                  </div>
                  {descriptor.detail && (
                    <div className="truncate text-xs text-zinc-400">
                      {descriptor.detail}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
