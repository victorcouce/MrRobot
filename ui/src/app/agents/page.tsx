"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAgentMatrix, useAppInfo, useProjects } from "@/lib/hooks";
import { LoadingState } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { api, ApiError } from "@/lib/api";
import type { AgentSpec, TaskComplexity, TaskType } from "@/lib/types";

const INSTALLABLE_CLI_PROVIDERS = new Set(["codex", "claude"]);

function isInstallableCliProvider(
  provider: string,
): provider is "codex" | "claude" {
  return INSTALLABLE_CLI_PROVIDERS.has(provider);
}

const TYPE_LABELS: Record<TaskType, string> = {
  architecture: "Arquitectura",
  planning: "Planificación",
  coding: "Programación",
  review: "Revisión",
  testing: "Pruebas",
  research: "Investigación",
};

const COMPLEXITY_ORDER: TaskComplexity[] = ["low", "medium", "high", "critical"];

const COMPLEXITY_LABELS: Record<TaskComplexity, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  critical: "Crítica",
};

function shortAgentLabel(agent: AgentSpec): string {
  if (agent.provider === "codex") return "Codex";
  if (agent.provider === "claude") {
    if (agent.model === "opus") return "Opus";
    if (agent.model === "haiku") return "Haiku";
    return "Sonnet";
  }
  if (agent.provider === "lmstudio") return agent.model ?? "LM Studio";
  return agent.model === "deepseek-v4-pro" ? "V4 Pro" : "Flash";
}

export default function AgentsPage() {
  const { info, refresh } = useAppInfo();
  const { projects } = useProjects();
  const { matrix } = useAgentMatrix();
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState<"codex" | "claude" | null>(null);
  const [installError, setInstallError] = useState<Record<string, string>>({});

  useEffect(() => {
    setLastChecked(new Date());
  }, [info]);

  const running = projects.filter((project) => project.status === "running");

  async function handleCheckNow() {
    setChecking(true);
    await refresh();
    setLastChecked(new Date());
    setChecking(false);
  }

  async function handleInstallCli(provider: "codex" | "claude") {
    setInstalling(provider);
    setInstallError((prev) => ({ ...prev, [provider]: "" }));

    try {
      const result = await api.installCli(provider);
      if (!result.ok) {
        setInstallError((prev) => ({
          ...prev,
          [provider]: result.error || "No se pudo instalar la CLI.",
        }));
      }
      await refresh();
      setLastChecked(new Date());
    } catch (error) {
      setInstallError((prev) => ({
        ...prev,
        [provider]: error instanceof ApiError ? error.message : "No se pudo instalar la CLI.",
      }));
    } finally {
      setInstalling(null);
    }
  }

  const formatTime = (date: Date | null) => {
    if (!date) return "";
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins === 0) return "hace unos segundos";
    if (mins === 1) return "hace 1 min";
    return `hace ${mins} min`;
  };

  if (!info) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingState label="Cargando agentes…" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-bg">
      {/* Header */}
      <header className="flex h-14 items-center justify-between border-b border-line bg-surface px-7 shadow-sm">
        <div>
          <h1 className="text-sm font-semibold text-ink">Agentes</h1>
          <p className="text-xs text-ink-3">Disponibilidad comprobada {formatTime(lastChecked)}</p>
        </div>
        <Button
          size="sm"
          onClick={handleCheckNow}
          loading={checking}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"></path>
          </svg>
          Comprobar ahora
        </Button>
      </header>

      {/* Content */}
      <div className="overflow-y-auto px-14 py-8">
        <div className="mb-8 space-y-1">
          <h1 className="font-serif text-4xl font-normal text-ink">Agentes</h1>
          <p className="text-sm text-ink-3">Quién está disponible, quién trabaja ahora y a quién se asigna cada tipo de tarea.</p>
        </div>

        {/* Agent cards */}
        <div className="mb-12 grid gap-4 grid-cols-1 md:grid-cols-2">
          {info.agents.map((agent) => {
            const installableProvider = isInstallableCliProvider(agent.provider)
              ? agent.provider
              : null;

            return (
            <div
              key={agent.provider}
              className="rounded-2xl border border-line bg-surface p-5 space-y-3"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div
                    className={`h-3 w-3 rounded-full mt-1 flex-shrink-0 ${
                      agent.connected ? "bg-success" : "bg-neutral-dot"
                    }`}
                  />
                  <div>
                    <h3 className="font-mono text-sm font-semibold text-ink">{agent.label}</h3>
                    <p className="text-xs text-ink-3 mt-1">
                      {agent.connected
                        ? agent.provider === "codex"
                          ? "Suscripción de ChatGPT · CLI encontrado"
                          : agent.provider === "claude"
                          ? "Suscripción de Claude · CLI encontrado"
                          : "Clave de API configurada"
                        : agent.reason || "No disponible"}
                    </p>
                  </div>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium"
                  style={{
                    backgroundColor: agent.connected ? "#E8F4EC" : "#F2F1ED",
                    color: agent.connected ? "#1E6B43" : "#6E6E76",
                  }}
                >
                  {agent.connected ? "✓ Conectado" : "No conectado"}
                </div>
              </div>
              {!agent.connected && installableProvider && (
                <div className="flex flex-col items-start gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={installing === installableProvider}
                    onClick={() => handleInstallCli(installableProvider)}
                  >
                    Instalar CLI
                  </Button>
                  {installError[installableProvider] && (
                    <p className="text-xs text-red-600">{installError[installableProvider]}</p>
                  )}
                </div>
              )}
            </div>
            );
          })}
        </div>

        {/* Working now */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-4 mb-3">
            Trabajando ahora
          </h2>
          {running.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-line bg-subtle p-8 text-center">
              <p className="text-sm text-ink-3">Sin tareas en ejecución</p>
            </div>
          ) : (
            <div className="space-y-2">
              {running.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 hover:bg-subtle transition-colors"
                >
                  <span className="text-sm font-medium text-ink">{project.name}</span>
                  <span className="inline-flex items-center gap-1.5 text-xs text-ink-3">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    {project.stats.activeAgents} agente{project.stats.activeAgents === 1 ? "" : "s"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Type × Complexity matrix */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-4 mb-3">
            Asignación: Tipo × Complejidad
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-subtle">
                  <th className="px-4 py-2 text-left font-semibold text-ink-3 text-xs">Tipo</th>
                  {COMPLEXITY_ORDER.map((c) => (
                    <th key={c} className="px-4 py-2 text-center font-semibold text-ink-3 text-xs">
                      {COMPLEXITY_LABELS[c]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.map((row) => (
                  <tr key={row.type} className="border-b border-line-soft last:border-0">
                    <td className="px-4 py-3 font-medium text-ink-2">{TYPE_LABELS[row.type]}</td>
                    {COMPLEXITY_ORDER.map((complexity) => (
                      <td key={complexity} className="px-4 py-3 text-center text-xs text-ink-3">
                        {shortAgentLabel(row.agents[complexity])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
