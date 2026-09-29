"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import type { Project, ProjectPreview } from "../../lib/types";
import { Block } from "../ui/Block";
import { Pill } from "../ui/Chip";
import { Button, Spinner } from "../ui/Button";
import { ExternalIcon, StopIcon } from "../ui/icons";

const POLL_INTERVAL_MS = 1500;
const ACTIVE_STATUSES = new Set(["starting", "installing", "running"]);

function isActive(preview: ProjectPreview | null): boolean {
  return preview !== null && ACTIVE_STATUSES.has(preview.status);
}

function statusLabel(preview: ProjectPreview | null): string {
  switch (preview?.status) {
    case "installing":
      return "Instalando dependencias";
    case "starting":
      return "Levantando el servidor";
    case "running":
      return "En marcha";
    case "failed":
      return "Falló";
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
  const runningUrl = preview?.status === "running" ? preview.url : undefined;
  const hasLog = Boolean(preview?.log && preview.log.trim().length > 0);

  return (
    <Block aria-label="Preview">
      <div className="flex items-center justify-between gap-4 border-b border-line px-[18px] py-3 pr-3.5">
        <div className="flex items-center gap-2.5 text-sm font-semibold text-ink">
          Preview
          <Pill
            className={
              active
                ? "bg-success-soft text-success-text"
                : "bg-muted text-ink-3"
            }
          >
            {active && (
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-success" />
            )}
            {statusLabel(preview)}
          </Pill>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {runningUrl && (
            <a
              href={runningUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Abrir preview"
              className="inline-flex items-center gap-1.5 px-2.5 font-mono text-[13px] text-primary hover:text-primary-hover"
            >
              {runningUrl.replace(/^https?:\/\//, "")}
              <ExternalIcon />
            </a>
          )}
          {active ? (
            <Button
              variant="secondary"
              size="sm"
              loading={busy}
              onClick={() => void run(() => api.stopPreview(project.id))}
            >
              <StopIcon />
              Detener
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              loading={busy}
              onClick={() => void run(() => api.startPreview(project.id))}
            >
              {preview?.status === "failed" ? "Reintentar" : "Abrir preview"}
            </Button>
          )}
        </div>
      </div>

      <div className="flex justify-center bg-muted p-5">
        <div className="flex h-[300px] w-full flex-col overflow-hidden rounded-[12px] border border-line-strong bg-surface">
          <div className="flex h-[30px] items-center gap-1.5 border-b border-line-soft px-3">
            <span className="h-[7px] w-[7px] rounded-full bg-line-strong" />
            <span className="h-[7px] w-[7px] rounded-full bg-line-strong" />
            <span className="h-[7px] w-[7px] rounded-full bg-line-strong" />
            <span className="ml-2 font-mono text-[11px] text-ink-4">
              {runningUrl ? runningUrl : "[Vista previa en vivo del proyecto]"}
            </span>
          </div>
          <div className="flex flex-1 items-center justify-center overflow-hidden">
            {runningUrl ? (
              <iframe
                src={runningUrl}
                title="Vista previa del proyecto"
                className="h-full w-full border-0"
              />
            ) : active ? (
              <Spinner className="h-5 w-5 text-ink-4" />
            ) : (
              <span className="text-[12.5px] text-ink-4">
                {preview?.error ?? "Sin preview activo"}
              </span>
            )}
          </div>
        </div>
      </div>

      {(error || hasLog) && (
        <div className="bg-ink px-[18px] py-3 font-mono text-[12px] leading-[1.7] text-line-strong">
          {error && <div className="text-danger">{error}</div>}
          {hasLog && (
            <pre className="whitespace-pre-wrap">{preview?.log}</pre>
          )}
        </div>
      )}
    </Block>
  );
}
