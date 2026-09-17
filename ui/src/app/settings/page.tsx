"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { AGENT_CHOICES, agentToChoice, type AgentChoice } from "@/lib/agents";
import { useAppInfo } from "@/lib/hooks";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/Badge";

type Section = "ejecucion" | "modelos" | "agentes" | "checks" | "github" | "apariencia";

export default function SettingsPage() {
  const { info, refresh } = useAppInfo();
  const [section, setSection] = useState<Section>("ejecucion");
  const [hasChanges, setHasChanges] = useState(false);

  const [concurrency, setConcurrency] = useState(2);
  const [maxRetries, setMaxRetries] = useState(1);
  const [maxReviewCycles, setMaxReviewCycles] = useState(2);
  const [plannerAttempts, setPlannerAttempts] = useState(2);
  const [planner, setPlanner] = useState<AgentChoice>("claude-opus");
  const [reviewer, setReviewer] = useState<AgentChoice>("claude-opus");
  const [supervisor, setSupervisor] = useState<AgentChoice>("claude-opus");
  const [deepseekKey, setDeepseekKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"system" | "light" | "dark">("light");

  useEffect(() => {
    if (!info) return;
    const config = info.config;
    setConcurrency(config.concurrency);
    setMaxRetries(config.maxRetriesPerAgent);
    setMaxReviewCycles(config.maxReviewFixCycles);
    setPlannerAttempts(config.plannerMaxAttempts ?? 2);
    setPlanner(agentToChoice(config.plannerAgent));
    setReviewer(agentToChoice(config.reviewerAgent));
    setSupervisor(agentToChoice(config.supervisorAgent));
  }, [info]);

  const handleChange = useCallback(() => {
    setHasChanges(true);
    setSaved(false);
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await api.updateConfig({
        concurrency,
        maxRetriesPerAgent: maxRetries,
        maxReviewFixCycles: maxReviewCycles,
        plannerMaxAttempts: plannerAttempts,
        plannerAgent: planner,
        reviewerAgent: reviewer,
        supervisorAgent: supervisor,
      });
      setSaved(true);
      setHasChanges(false);
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    if (!info) return;
    const config = info.config;
    setConcurrency(config.concurrency);
    setMaxRetries(config.maxRetriesPerAgent);
    setMaxReviewCycles(config.maxReviewFixCycles);
    setPlannerAttempts(config.plannerMaxAttempts ?? 2);
    setPlanner(agentToChoice(config.plannerAgent));
    setReviewer(agentToChoice(config.reviewerAgent));
    setSupervisor(agentToChoice(config.supervisorAgent));
    setHasChanges(false);
    setSaved(false);
  }

  if (!info) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingState label="Cargando configuración…" />
      </div>
    );
  }

  const agentConnected = (provider: string) => {
    return info.agents.some((a) => a.provider === provider && a.connected);
  };

  return (
    <div className="flex h-full flex-col bg-bg">
      {/* Header */}
      <header className="flex h-14 items-center justify-between border-b border-line bg-surface px-7 shadow-sm">
        <div>
          <h1 className="text-sm font-semibold text-ink">Ajustes</h1>
          <p className="text-xs text-ink-3">Se aplican a todos los proyectos y chats</p>
        </div>
        <div className="flex items-center gap-3">
          {hasChanges && <span className="text-xs font-medium text-ink-3">2 cambios sin guardar</span>}
          {hasChanges && (
            <>
              <Button variant="ghost" size="sm" onClick={handleDiscard}>
                Descartar
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={saving}
                onClick={handleSubmit}
              >
                Guardar cambios
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 gap-14 overflow-hidden px-16 py-10">
        {/* Navigation */}
        <nav className="w-44 flex-shrink-0 space-y-1" aria-label="Secciones">
          {(["ejecucion", "modelos", "agentes", "checks", "github", "apariencia"] as Section[]).map(
            (sec) => (
              <button
                key={sec}
                onClick={() => setSection(sec)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                  section === sec
                    ? "bg-muted text-ink"
                    : "text-ink-3 hover:text-ink"
                }`}
              >
                {sec === "ejecucion" && "Ejecución"}
                {sec === "modelos" && "Modelos por rol"}
                {sec === "agentes" && "Agentes"}
                {sec === "checks" && "Checks"}
                {sec === "github" && "GitHub"}
                {sec === "apariencia" && "Apariencia"}
              </button>
            )
          )}
        </nav>

        {/* Settings sections */}
        <div className="flex-1 overflow-y-auto">
          <form onSubmit={handleSubmit} className="max-w-2xl space-y-7">
            {error && (
              <div className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger-text">
                {error}
              </div>
            )}

            {section === "ejecucion" && (
              <section className="space-y-0 rounded-2xl border border-line bg-surface overflow-hidden">
                <div className="border-b border-line px-5 py-3">
                  <h2 className="text-sm font-semibold text-ink">Ejecución</h2>
                  <p className="mt-1 text-xs text-ink-3">Cómo reparte y reintenta el trabajo el motor.</p>
                </div>
                <div className="divide-y divide-line-soft">
                  <SettingRow label="Concurrencia" desc="Tareas que se ejecutan a la vez en cada lote.">
                    <Stepper
                      value={concurrency}
                      onChange={(val) => {
                        setConcurrency(val);
                        handleChange();
                      }}
                      min={1}
                    />
                  </SettingRow>
                  <SettingRow label="Reintentos por agente" desc="Antes de pasar al siguiente agente de la cadena.">
                    <Stepper
                      value={maxRetries}
                      onChange={(val) => {
                        setMaxRetries(val);
                        handleChange();
                      }}
                      min={0}
                    />
                  </SettingRow>
                  <SettingRow label="Ciclos de review" desc="Correcciones con feedback del reviewer.">
                    <Stepper
                      value={maxReviewCycles}
                      onChange={(val) => {
                        setMaxReviewCycles(val);
                        handleChange();
                      }}
                      min={0}
                    />
                  </SettingRow>
                  <SettingRow label="Intentos del planner" desc="Veces que puede reintentar hasta generar un plan válido.">
                    <Stepper
                      value={plannerAttempts}
                      onChange={(val) => {
                        setPlannerAttempts(val);
                        handleChange();
                      }}
                      min={1}
                    />
                  </SettingRow>
                </div>
                <div className="bg-subtle px-5 py-3 text-xs text-ink-3">
                  Un proyecto que ya se está ejecutando mantiene los valores con los que empezó.
                </div>
              </section>
            )}

            {section === "modelos" && (
              <section className="space-y-0 rounded-2xl border border-line bg-surface overflow-hidden">
                <div className="border-b border-line px-5 py-3">
                  <h2 className="text-sm font-semibold text-ink">Modelos por rol</h2>
                  <p className="mt-1 text-xs text-ink-3">Quién planifica, revisa y supervisa.</p>
                </div>
                <div className="divide-y divide-line-soft">
                  <SettingRow label="Planner" desc="Descompone el objetivo en tareas.">
                    <select
                      value={planner}
                      onChange={(e) => {
                        setPlanner(e.target.value as AgentChoice);
                        handleChange();
                      }}
                      className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none"
                    >
                      {AGENT_CHOICES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </SettingRow>
                  <SettingRow label="Reviewer" desc="Valida cada tarea contra sus criterios.">
                    <select
                      value={reviewer}
                      onChange={(e) => {
                        setReviewer(e.target.value as AgentChoice);
                        handleChange();
                      }}
                      className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none"
                    >
                      {AGENT_CHOICES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </SettingRow>
                  <SettingRow label="Supervisor" desc="Decide continuar, replanificar, pausar o fallar.">
                    <select
                      value={supervisor}
                      onChange={(e) => {
                        setSupervisor(e.target.value as AgentChoice);
                        handleChange();
                      }}
                      className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none"
                    >
                      {AGENT_CHOICES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </SettingRow>
                </div>
              </section>
            )}

            {section === "agentes" && (
              <section className="space-y-0 rounded-2xl border border-line bg-surface overflow-hidden">
                <div className="border-b border-line px-5 py-3">
                  <h2 className="text-sm font-semibold text-ink">Agentes</h2>
                  <p className="mt-1 text-xs text-ink-3">Conexión de cada proveedor.</p>
                </div>
                <div className="divide-y divide-line-soft px-5 py-3">
                  <AgentStatus label="codex" connected={agentConnected("codex")} desc="Suscripción de ChatGPT · CLI en PATH" />
                  <AgentStatus label="claude · sonnet, opus" connected={agentConnected("claude")} desc="Suscripción de Claude · CLI en PATH" />
                  <div className="space-y-2 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${agentConnected("deepseek") ? "bg-success" : "bg-neutral-dot"}`} />
                      <div>
                        <div className="font-mono text-sm font-medium text-ink">deepseek · flash, v4-pro</div>
                        <div className="text-xs text-ink-3">Necesita una clave de API. Es el único que consume tokens de pago.</div>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <input
                        type="password"
                        placeholder="DEEPSEEK_API_KEY"
                        value={deepseekKey}
                        onChange={(e) => {
                          setDeepseekKey(e.target.value);
                          handleChange();
                        }}
                        className="flex-1 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-4 outline-none"
                      />
                      <Button size="sm" variant="secondary">Comprobar</Button>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {section === "checks" && (
              <section className="space-y-0 rounded-2xl border border-line bg-surface overflow-hidden">
                <div className="border-b border-line px-5 py-3">
                  <h2 className="text-sm font-semibold text-ink">Checks</h2>
                  <p className="mt-1 text-xs text-ink-3">Scripts que se ejecutan sobre cada tarea.</p>
                </div>
                <div className="divide-y divide-line-soft px-5 py-4">
                  <div className="pb-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm text-ink">Detectar scripts automáticamente</div>
                        <div className="text-xs text-ink-3">Usa los que existan en package.json.</div>
                      </div>
                      <Toggle checked={true} onChange={handleChange} />
                    </div>
                  </div>
                  <div className="pt-4">
                    <div className="mb-2 font-medium text-sm text-ink">Orden</div>
                    <div className="flex gap-2">
                      {["typecheck", "build", "test"].map((check) => (
                        <span
                          key={check}
                          className="inline-flex items-center rounded-lg bg-muted px-2 py-1 font-mono text-xs text-ink"
                        >
                          {check}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {section === "github" && (
              <section className="space-y-0 rounded-2xl border border-line bg-surface overflow-hidden">
                <div className="border-b border-line px-5 py-3">
                  <h2 className="text-sm font-semibold text-ink">GitHub</h2>
                  <p className="mt-1 text-xs text-ink-3">Para validar remotos y subir la rama final.</p>
                </div>
                <SettingRow label="GITHUB_TOKEN" desc="Definido en .env · el push se hace solo a ramas agent/project-*-final">
                  <div className="inline-flex items-center gap-2 rounded-full bg-success-soft px-3 py-1 text-xs font-medium text-success-text">
                    ✓ Configurado
                  </div>
                </SettingRow>
              </section>
            )}

            {section === "apariencia" && (
              <section className="space-y-0 rounded-2xl border border-line bg-surface overflow-hidden">
                <div className="border-b border-line px-5 py-3">
                  <h2 className="text-sm font-semibold text-ink">Apariencia</h2>
                </div>
                <SettingRow label="Tema">
                  <div className="inline-flex gap-1 rounded-xl bg-muted p-1">
                    {(["system", "light", "dark"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => {
                          setTheme(t);
                          handleChange();
                        }}
                        className={`rounded-lg px-3 py-1 text-sm font-medium transition-colors ${
                          theme === t
                            ? "bg-surface text-ink shadow-sm"
                            : "bg-transparent text-ink-3"
                        }`}
                      >
                        {t === "system" && "Sistema"}
                        {t === "light" && "Claro"}
                        {t === "dark" && "Oscuro"}
                      </button>
                    ))}
                  </div>
                </SettingRow>
              </section>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

function SettingRow({
  label,
  desc,
  children,
}: {
  label: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-8 px-5 py-3">
      <div>
        <div className="font-medium text-sm text-ink">{label}</div>
        {desc && <div className="mt-0.5 text-xs text-ink-3 max-w-sm">{desc}</div>}
      </div>
      {children}
    </div>
  );
}

function Stepper({
  value,
  onChange,
  min = 0,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-line-strong bg-surface">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="h-9 w-9 flex items-center justify-center text-ink-2 hover:bg-muted rounded-l-md"
      >
        −
      </button>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-12 text-center font-medium text-sm border-l border-r border-line-strong outline-none bg-surface"
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="h-9 w-9 flex items-center justify-center text-ink-2 hover:bg-muted rounded-r-md"
      >
        +
      </button>
    </div>
  );
}

function AgentStatus({
  label,
  connected,
  desc,
}: {
  label: string;
  connected: boolean;
  desc: string;
}) {
  return (
    <div className="py-3 flex items-center justify-between">
      <div className="flex items-start gap-3">
        <div className={`h-2 w-2 rounded-full mt-1 flex-shrink-0 ${connected ? "bg-success" : "bg-neutral-dot"}`} />
        <div>
          <div className="font-mono text-sm font-medium text-ink">{label}</div>
          <div className="text-xs text-ink-3 mt-0.5">{desc}</div>
        </div>
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" defaultChecked className="w-4 h-4 accent-primary" />
        <span className="text-xs text-ink-3">Marcado por defecto</span>
      </label>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? "bg-primary" : "bg-muted"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-6" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
