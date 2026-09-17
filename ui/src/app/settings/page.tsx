"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import {
  AGENT_CHOICES,
  agentToChoice,
  choiceToAgent,
  type AgentChoice,
} from "@/lib/agents";
import { useAppInfo } from "@/lib/hooks";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/Badge";

const DEFAULT_CHECKS = ["typecheck", "build", "test"];

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
  const [checkingKey, setCheckingKey] = useState(false);
  const [keyResult, setKeyResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [autoChecks, setAutoChecks] = useState(true);
  const [checkCommands, setCheckCommands] = useState<string[]>(DEFAULT_CHECKS);
  const [defaultAgents, setDefaultAgents] = useState<AgentChoice[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { theme, setTheme } = useTheme();

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
    // Sin comandos explícitos el motor detecta los scripts del package.json.
    setAutoChecks(config.checks.commands.length === 0);
    setCheckCommands(
      config.checks.commands.length > 0 ? config.checks.commands : DEFAULT_CHECKS,
    );
    setDefaultAgents(config.defaultAllowedAgents.map(agentToChoice));
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
        plannerAgent: choiceToAgent(planner),
        reviewerAgent: choiceToAgent(reviewer),
        supervisorAgent: choiceToAgent(supervisor),
        checks: { commands: autoChecks ? [] : checkCommands },
        defaultAllowedAgents: defaultAgents.map(choiceToAgent),
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
    setAutoChecks(config.checks.commands.length === 0);
    setCheckCommands(
      config.checks.commands.length > 0 ? config.checks.commands : DEFAULT_CHECKS,
    );
    setDefaultAgents(config.defaultAllowedAgents.map(agentToChoice));
    setHasChanges(false);
    setSaved(false);
  }

  async function handleCheckKey() {
    setCheckingKey(true);
    setKeyResult(null);

    try {
      const result = await api.checkDeepSeekKey(deepseekKey);

      setKeyResult(
        result.ok
          ? {
              ok: true,
              message:
                "Clave válida y aplicada al backend. Añádela a .env para que sobreviva a un reinicio.",
            }
          : { ok: false, message: result.error ?? "La clave no es válida." },
      );

      if (result.ok) {
        setDeepseekKey("");
        await refresh();
      }
    } catch (error) {
      setKeyResult({
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setCheckingKey(false);
    }
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
          {saved && !hasChanges && (
            <span className="text-xs font-medium text-success-text">Guardado</span>
          )}
          {hasChanges && (
            <span className="text-xs font-medium text-ink-3">
              Cambios sin guardar
            </span>
          )}
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
                  <p className="mt-1 text-xs text-ink-3">
                    Conexión de cada proveedor y qué se marca al crear un proyecto.
                  </p>
                </div>
                <div className="divide-y divide-line-soft px-5 py-3">
                  {AGENT_CHOICES.map((choice) => {
                    const spec = choiceToAgent(choice.value);
                    const connected = agentConnected(spec.provider);
                    const marked = defaultAgents.includes(choice.value);

                    return (
                      <div
                        key={choice.value}
                        className="flex items-center justify-between py-3"
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${
                              connected ? "bg-success" : "bg-neutral-dot"
                            }`}
                          />
                          <div>
                            <div className="font-mono text-sm font-medium text-ink">
                              {choice.label}
                            </div>
                            <div className="mt-0.5 text-xs text-ink-3">
                              {connected
                                ? "Disponible"
                                : (info.agents.find(
                                    (agent) => agent.provider === spec.provider,
                                  )?.reason ?? "No disponible")}
                            </div>
                          </div>
                        </div>
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={marked}
                            onChange={(event) => {
                              setDefaultAgents((current) =>
                                event.target.checked
                                  ? [...current, choice.value]
                                  : current.filter((item) => item !== choice.value),
                              );
                              handleChange();
                            }}
                            className="h-4 w-4 accent-primary"
                          />
                          <span className="text-xs text-ink-3">
                            Marcado por defecto
                          </span>
                        </label>
                      </div>
                    );
                  })}

                  <div className="space-y-2 py-3">
                    <div className="text-sm font-medium text-ink">
                      Clave de DeepSeek
                    </div>
                    <div className="text-xs text-ink-3">
                      Es el único proveedor que consume tokens de pago.
                    </div>
                    <div className="flex gap-2 pt-1">
                      <input
                        type="password"
                        placeholder="DEEPSEEK_API_KEY"
                        value={deepseekKey}
                        onChange={(event) => {
                          setDeepseekKey(event.target.value);
                          setKeyResult(null);
                        }}
                        className="flex-1 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-4"
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        type="button"
                        loading={checkingKey}
                        disabled={!deepseekKey.trim()}
                        onClick={() => void handleCheckKey()}
                      >
                        Comprobar y aplicar
                      </Button>
                    </div>
                    {keyResult && (
                      <p
                        role="status"
                        className={`text-xs ${
                          keyResult.ok ? "text-success-text" : "text-danger-text"
                        }`}
                      >
                        {keyResult.message}
                      </p>
                    )}
                  </div>
                </div>
              </section>
            )}

            {section === "checks" && (
              <section className="space-y-0 rounded-2xl border border-line bg-surface overflow-hidden">
                <div className="border-b border-line px-5 py-3">
                  <h2 className="text-sm font-semibold text-ink">Checks</h2>
                  <p className="mt-1 text-xs text-ink-3">
                    Scripts que se ejecutan sobre cada tarea.
                  </p>
                </div>
                <div className="divide-y divide-line-soft px-5 py-4">
                  <div className="pb-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-ink">
                          Detectar scripts automáticamente
                        </div>
                        <div className="text-xs text-ink-3">
                          Usa los que existan en package.json.
                        </div>
                      </div>
                      <Toggle
                        label="Detectar scripts automáticamente"
                        checked={autoChecks}
                        onChange={() => {
                          setAutoChecks(!autoChecks);
                          handleChange();
                        }}
                      />
                    </div>
                  </div>
                  <div className="pt-4">
                    <div className="mb-2 text-sm font-medium text-ink">
                      {autoChecks ? "Se probarán, si existen" : "Orden"}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {checkCommands.map((check) => (
                        <span
                          key={check}
                          className={`inline-flex items-center gap-1.5 rounded-lg bg-muted px-2 py-1 font-mono text-xs ${
                            autoChecks ? "text-ink-4" : "text-ink"
                          }`}
                        >
                          {check}
                          {!autoChecks && (
                            <button
                              type="button"
                              aria-label={`Quitar ${check}`}
                              onClick={() => {
                                setCheckCommands((current) =>
                                  current.filter((item) => item !== check),
                                );
                                handleChange();
                              }}
                              className="focus-ring text-ink-4 hover:text-danger"
                            >
                              ×
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                    {!autoChecks && (
                      <input
                        type="text"
                        placeholder="Añadir un script y pulsar Enter"
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") return;
                          event.preventDefault();
                          const value = event.currentTarget.value.trim();
                          if (!value || checkCommands.includes(value)) return;
                          setCheckCommands((current) => [...current, value]);
                          event.currentTarget.value = "";
                          handleChange();
                        }}
                        className="mt-3 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-4"
                      />
                    )}
                  </div>
                </div>
              </section>
            )}

            {section === "github" && (
              <section className="space-y-0 rounded-2xl border border-line bg-surface overflow-hidden">
                <div className="border-b border-line px-5 py-3">
                  <h2 className="text-sm font-semibold text-ink">GitHub</h2>
                  <p className="mt-1 text-xs text-ink-3">
                    Para validar remotos y subir la rama final.
                  </p>
                </div>
                <SettingRow
                  label="GITHUB_TOKEN"
                  desc="Se lee del entorno del backend. El push solo se hace a ramas agent/project-*-final."
                >
                  {info.githubToken ? (
                    <div className="inline-flex items-center gap-2 rounded-full bg-success-soft px-3 py-1 text-xs font-medium text-success-text">
                      ✓ Configurado
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-2 rounded-full bg-warning-soft px-3 py-1 text-xs font-medium text-warning-text">
                      Sin definir
                    </div>
                  )}
                </SettingRow>
              </section>
            )}

            {section === "apariencia" && (
              <section className="space-y-0 rounded-2xl border border-line bg-surface overflow-hidden">
                <div className="border-b border-line px-5 py-3">
                  <h2 className="text-sm font-semibold text-ink">Apariencia</h2>
                  <p className="mt-1 text-xs text-ink-3">
                    Se guarda en este navegador, no en la configuración del motor.
                  </p>
                </div>
                <SettingRow label="Tema">
                  <div className="inline-flex gap-1 rounded-xl bg-muted p-1">
                    {(["system", "light", "dark"] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setTheme(option)}
                        className={`rounded-lg px-3 py-1 text-sm font-medium transition-colors ${
                          theme === option
                            ? "bg-surface text-ink shadow-sm"
                            : "bg-transparent text-ink-3"
                        }`}
                      >
                        {option === "system" && "Sistema"}
                        {option === "light" && "Claro"}
                        {option === "dark" && "Oscuro"}
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
        min={min}
        value={value}
        onChange={(e) => {
          const parsed = Number(e.target.value);
          if (Number.isFinite(parsed)) onChange(Math.max(min, parsed));
        }}
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

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange?: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
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
