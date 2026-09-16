"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import type { Project, ProjectPreview } from "../../lib/types";
import { Button, Spinner } from "../ui/Button";

const POLL_INTERVAL_MS = 1500;
const ACTIVE_STATUSES = new Set(["starting", "installing", "running"]);

function isActive(preview: ProjectPreview | null): boolean {
  return preview !== null && ACTIVE_STATUSES.has(preview.status);
}

function statusLabel(preview: ProjectPreview | null): string {
  switch (preview?.status) {
    case "installing":
      return "Instalando dependencias…";
    case "starting":
      return "Levantando el servidor…";
    case "running":
      return "Preview en marcha";
    case "failed":
      return "El preview falló";
    default:
      return "Sin preview activo";
  }
}

export function PreviewPanel({ project }: { project: Project }) {
  const [preview, setPreview] = useState<ProjectPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await api.getPreview(project.id);
      if (mounted.current) setPreview(next);
    } catch (error) {
      if (mounted.current) {
        setError(error instanceof Error ? error.message : String(error));
      }
    }
  }, [project.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isActive(preview)) return;

    const timer = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [preview, refresh]);

  async function run(fn: () => Promise<ProjectPreview>) {
    setBusy(true);
    setError(null);

    try {
      const next = await fn();
      if (mounted.current) setPreview(next);
    } catch (error) {
      if (mounted.current) {
        setError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  const active = isActive(preview);
  const runningUrl =
    preview?.status === "running" ? preview.url : undefined;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Preview
          </h3>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {statusLabel(preview)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {active && (
            <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
              <Spinner className="h-3.5 w-3.5" />
              {preview?.command ?? ""}
            </span>
          )}

          {runningUrl && (
            <a
              href={runningUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring inline-flex h-9 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-colors hover:brightness-110"
            >
              Abrir preview
            </a>
          )}

          {!active && (
            <Button
              variant="primary"
              loading={busy}
              onClick={() => void run(() => api.startPreview(project.id))}
            >
              {preview?.status === "failed" ? "Reintentar" : "Abrir preview"}
            </Button>
          )}

          {active && (
            <Button
              variant="danger"
              loading={busy}
              onClick={() => void run(() => api.stopPreview(project.id))}
            >
              Detener
            </Button>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </p>
      )}

      {preview?.error && !error && (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {preview.error}
        </p>
      )}

      {preview?.log && preview.log.trim().length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-zinc-400">
            Log
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-200">
            {preview.log}
          </pre>
        </details>
      )}
    </div>
  );
}
