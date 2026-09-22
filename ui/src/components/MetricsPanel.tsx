"use client";

import type { MetricsSummary } from "@/lib/types";

function successRate(ok: number, total: number): number {
  return total === 0 ? 0 : Math.round((100 * ok) / total);
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-ink-4">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-ink">{value}</div>
    </div>
  );
}

export function MetricsPanel({ metrics }: { metrics: MetricsSummary | null }) {
  if (!metrics) return null;

  const totalFailures = metrics.topFailures.reduce((sum, f) => sum + f.count, 0);

  return (
    <section className="mb-6 space-y-4" aria-label="Métricas de ejecución">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Proyectos" value={String(metrics.projects)} />
        <Stat
          label="Tareas completadas"
          value={`${metrics.tasks.completed}/${metrics.tasks.attempts}`}
        />
        <Stat label="Fallos de tarea" value={String(metrics.tasks.failed)} />
        <Stat label="Replans" value={String(metrics.replans)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="border-b border-line px-4 py-2.5 text-sm font-semibold text-ink">
            Rendimiento por agente
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-4">
                <th className="px-4 py-2 font-medium">Agente</th>
                <th className="px-2 py-2 font-medium">Rol</th>
                <th className="px-2 py-2 text-right font-medium">Intentos</th>
                <th className="px-2 py-2 text-right font-medium">Éxito</th>
                <th className="px-4 py-2 text-right font-medium">Tiempo medio</th>
              </tr>
            </thead>
            <tbody>
              {metrics.agentRuns.map((run) => {
                const done = run.ok + run.failed;
                return (
                  <tr
                    key={`${run.scope}|${run.agent}`}
                    className="border-t border-line-soft"
                  >
                    <td className="px-4 py-2 font-mono text-[12px] text-ink-2">
                      {run.agent}
                    </td>
                    <td className="px-2 py-2 text-ink-3">{run.scope}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-ink-2">
                      {run.attempts}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      <span
                        className={
                          successRate(run.ok, done) >= 60
                            ? "text-success-text"
                            : "text-danger-text"
                        }
                      >
                        {successRate(run.ok, done)}%
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink-3">
                      {done > 0 ? formatMs(run.totalMs / done) : "—"}
                    </td>
                  </tr>
                );
              })}
              {metrics.agentRuns.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-center text-ink-4">
                    Sin ejecuciones todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="border-b border-line px-4 py-2.5 text-sm font-semibold text-ink">
            Causas de fallo ({totalFailures})
          </div>
          <ul className="divide-y divide-line-soft">
            {metrics.topFailures.slice(0, 8).map((failure) => (
              <li
                key={failure.reason}
                className="flex items-center justify-between px-4 py-2 text-[13px]"
              >
                <span className="text-ink-2">{failure.reason}</span>
                <span className="font-mono tabular-nums text-ink-3">
                  {failure.count}
                </span>
              </li>
            ))}
            {metrics.topFailures.length === 0 && (
              <li className="px-4 py-4 text-center text-ink-4">
                Sin fallos registrados.
              </li>
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}
