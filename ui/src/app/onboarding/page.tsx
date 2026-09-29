"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAppInfo } from "@/lib/hooks";
import {
  AGENT_CHOICES,
  agentToChoice,
  canWriteFiles,
  choiceToAgent,
  type AgentChoice,
} from "@/lib/agents";
import { hasConnectedFileWriter, useAgentSetup } from "@/lib/agent-setup";
import { dismissOnboardingForSession } from "@/lib/onboarding";
import type { AppInfo } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/Badge";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";
import { AgentSetupCard } from "@/components/onboarding/AgentSetupCard";
import { ResultMessage, StatusPill } from "@/components/onboarding/StatusPill";

const STEPS = ["Bienvenida", "Agentes", "Por defecto", "GitHub", "Listo"];

/** Sin agentes guardados se proponen los conectados, uno por proveedor. */
const SUGGESTED: AgentChoice[] = ["codex", "claude-sonnet", "deepseek", "lmstudio"];

function initialDefaults(info: AppInfo): AgentChoice[] {
  if (info.config.defaultAllowedAgents.length > 0) {
    return info.config.defaultAllowedAgents.map(agentToChoice);
  }
  return SUGGESTED.filter((choice) =>
    info.agents.some(
      (agent) => agent.connected && agent.provider === choiceToAgent(choice).provider,
    ),
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { info, error, refresh } = useAppInfo();
  const setup = useAgentSetup(refresh);
  const [step, setStep] = useState(0);
  const [rechecking, setRechecking] = useState(false);
  const [defaults, setDefaults] = useState<AgentChoice[] | null>(null);
  const [githubToken, setGithubToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (info && defaults === null) setDefaults(initialDefaults(info));
  }, [info, defaults]);

  const recheck = useCallback(async () => {
    setRechecking(true);
    await refresh();
    setRechecking(false);
  }, [refresh]);

  const leave = useCallback(() => {
    dismissOnboardingForSession();
    router.push("/");
  }, [router]);

  if (!info) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        {error ? (
          <div className="max-w-md space-y-2 px-6 text-center">
            <p className="text-sm font-medium text-ink">No se pudo contactar con el backend.</p>
            <p className="text-xs text-ink-3">
              Arráncalo con <code className="font-mono">npm run dev</code> en la raíz del repo y
              recarga esta página. ({error})
            </p>
          </div>
        ) : (
          <LoadingState label="Comprobando tu equipo…" />
        )}
      </div>
    );
  }

  const readyAgents = hasConnectedFileWriter(info.agents);
  const chosen = defaults ?? [];
  const chosenSpecs = chosen.map(choiceToAgent);
  const missingWriter = chosen.length > 0 && !chosenSpecs.some(canWriteFiles);

  async function saveDefaults() {
    setSaving(true);
    setSaveError(null);
    try {
      await api.updateConfig({ defaultAllowedAgents: chosenSpecs });
      await refresh();
      setStep((current) => current + 1);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function finish() {
    setSaving(true);
    setSaveError(null);
    try {
      await api.completeOnboarding();
      leave();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  const next = () => setStep((current) => Math.min(current + 1, STEPS.length - 1));
  const back = () => setStep((current) => Math.max(current - 1, 0));

  let body: React.ReactNode;
  let primary: React.ReactNode;

  switch (step) {
    case 0:
      body = (
        <div className="space-y-4">
          <h1 className="font-display text-3xl font-semibold text-ink">Bienvenido a Mr. Robot</h1>
          <p className="text-sm leading-relaxed text-ink-2">
            Mr. Robot recibe un objetivo, lo divide en tareas y las reparte entre Codex, Claude,
            DeepSeek o LM Studio, cada una en su propia rama de Git. En unos pasos dejamos listo
            todo lo necesario para empezar.
          </p>
          <ul className="space-y-2 text-sm text-ink-2">
            <li>· Codex y Claude usan tu suscripción normal de ChatGPT / Claude: sin tokens de pago.</li>
            <li>· Si un proveedor agota su cuota, el motor pasa solo al siguiente.</li>
            <li>· Lo que configures aquí se guarda y sobrevive a un reinicio del backend.</li>
          </ul>
          {info.mock ? (
            <p className="rounded-lg bg-warning-soft px-4 py-3 text-xs text-warning-text">
              El backend está en modo simulado (MRROBOT_MOCK=1): puedes probar la app sin
              configurar nada.
            </p>
          ) : (
            <p className="text-xs text-ink-4">
              ¿Solo quieres probar? Arranca el backend con{" "}
              <code className="font-mono">MRROBOT_MOCK=1 npm run dev</code> y no necesitarás
              ningún agente.
            </p>
          )}
        </div>
      );
      primary = (
        <Button variant="primary" onClick={next}>
          Empezar
        </Button>
      );
      break;

    case 1:
      body = (
        <div className="space-y-4">
          <div>
            <h1 className="text-xl font-semibold text-ink">Conecta tus agentes</h1>
            <p className="mt-1 text-sm text-ink-3">
              Necesitas al menos uno. Puedes conectar más ahora o después desde Ajustes.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {info.agents.map((agent) => (
              <AgentSetupCard
                key={agent.provider}
                agent={agent}
                setup={setup}
                onRecheck={() => void recheck()}
                rechecking={rechecking}
              />
            ))}
          </div>
          {!readyAgents && (
            <p className="text-xs text-warning-text">
              Aún no hay ningún agente conectado que pueda escribir código.
            </p>
          )}
        </div>
      );
      primary = (
        <Button variant="primary" onClick={next} disabled={!readyAgents && !info.mock}>
          Siguiente
        </Button>
      );
      break;

    case 2:
      body = (
        <div className="space-y-4">
          <div>
            <h1 className="text-xl font-semibold text-ink">Agentes por defecto</h1>
            <p className="mt-1 text-sm text-ink-3">
              Los que usará el motor en cada chat y proyecto nuevo. Sin marcar ninguno, puede
              usarlos todos.
            </p>
          </div>
          <div className="divide-y divide-line-soft rounded-2xl border border-line bg-surface px-5">
            {AGENT_CHOICES.map((choice) => {
              const provider = choiceToAgent(choice.value).provider;
              const connected = info.agents.some(
                (agent) => agent.provider === provider && agent.connected,
              );
              const checked = chosen.includes(choice.value);
              return (
                <label
                  key={choice.value}
                  className="flex cursor-pointer items-center justify-between gap-3 py-3"
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setDefaults(
                          checked
                            ? chosen.filter((value) => value !== choice.value)
                            : [...chosen, choice.value],
                        )
                      }
                      className="h-4 w-4 accent-ink"
                    />
                    <span className="font-mono text-sm text-ink">{choice.label}</span>
                  </span>
                  <StatusPill ok={connected} label={connected ? "Disponible" : "No conectado"} />
                </label>
              );
            })}
          </div>
          {missingWriter && (
            <p className="text-xs text-danger-text">
              Marca al menos uno que escriba archivos: Codex, Claude, DeepSeek o LM Studio.
            </p>
          )}
          {saveError && <ResultMessage ok={false} message={saveError} />}
        </div>
      );
      primary = (
        <Button
          variant="primary"
          onClick={() => void saveDefaults()}
          loading={saving}
          disabled={missingWriter}
        >
          Guardar y seguir
        </Button>
      );
      break;

    case 3:
      body = (
        <div className="space-y-4">
          <div>
            <h1 className="text-xl font-semibold text-ink">GitHub (opcional)</h1>
            <p className="mt-1 text-sm text-ink-3">
              Con un token, Mr. Robot valida los remotos y sube la rama final de cada proyecto.
              Sin él, todo se queda en local.
            </p>
          </div>
          <div className="space-y-3 rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-sm text-ink">GITHUB_TOKEN</span>
              <StatusPill
                ok={info.githubToken}
                label={info.githubToken ? "✓ Configurado" : "Sin definir"}
              />
            </div>
            <form
              className="flex gap-2"
              onSubmit={async (event) => {
                event.preventDefault();
                const outcome = await setup.checkGitHub(githubToken);
                if (outcome.ok) setGithubToken("");
              }}
            >
              <input
                type="password"
                value={githubToken}
                onChange={(event) => setGithubToken(event.target.value)}
                placeholder="ghp_… o github_pat_…"
                aria-label="Token de GitHub"
                autoComplete="off"
                className="h-8 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 font-mono text-xs text-ink outline-none focus:border-primary"
              />
              <Button
                type="submit"
                size="sm"
                variant="secondary"
                loading={setup.busy === "github"}
                disabled={!githubToken.trim()}
              >
                Validar y guardar
              </Button>
            </form>
            {setup.results.github && <ResultMessage {...setup.results.github} />}
            <p className="text-xs text-ink-4">
              Necesita permiso de lectura y escritura sobre el contenido de los repos. El push
              solo se hace a ramas <code className="font-mono">agent/project-*-final</code>.
            </p>
          </div>
        </div>
      );
      primary = (
        <Button variant="primary" onClick={next}>
          {info.githubToken ? "Siguiente" : "Saltar"}
        </Button>
      );
      break;

    default: {
      const rows: Array<{ label: string; ok: boolean; detail: string }> = [
        {
          label: "Agentes",
          ok: readyAgents,
          detail:
            info.agents
              .filter((agent) => agent.connected)
              .map((agent) => agent.label)
              .join(", ") || "Ninguno conectado",
        },
        {
          label: "Agentes por defecto",
          ok: true,
          detail:
            info.config.defaultAllowedAgents.length > 0
              ? info.config.defaultAllowedAgents
                  .map((agent) => AGENT_CHOICES.find((c) => c.value === agentToChoice(agent))?.label)
                  .join(", ")
              : "Todos los disponibles",
        },
        {
          label: "GitHub",
          ok: info.githubToken,
          detail: info.githubToken ? "Token configurado" : "Solo local",
        },
      ];
      body = (
        <div className="space-y-4">
          <div>
            <h1 className="text-xl font-semibold text-ink">Todo listo</h1>
            <p className="mt-1 text-sm text-ink-3">
              Puedes cambiar cualquier cosa más adelante en Ajustes.
            </p>
          </div>
          <ul className="divide-y divide-line-soft rounded-2xl border border-line bg-surface px-5">
            {rows.map((row) => (
              <li key={row.label} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink">{row.label}</div>
                  <div className="truncate text-xs text-ink-3">{row.detail}</div>
                </div>
                <StatusPill ok={row.ok} label={row.ok ? "✓" : "—"} />
              </li>
            ))}
          </ul>
          {saveError && <ResultMessage ok={false} message={saveError} />}
        </div>
      );
      primary = (
        <Button variant="primary" onClick={() => void finish()} loading={saving}>
          Ir a Mr. Robot
        </Button>
      );
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="flex items-center justify-between px-6 py-5 md:px-10">
        <div className="flex items-center gap-2">
          <Image src="/logo-mark.svg" alt="" width={22} height={22} className="h-[22px] w-[22px]" />
          <span className="font-display text-[14px] font-semibold text-ink">Mr. Robot</span>
        </div>
        {step < STEPS.length - 1 && (
          <button
            type="button"
            onClick={leave}
            className="focus-ring rounded text-xs font-medium text-ink-3 hover:text-ink"
          >
            Omitir por ahora
          </button>
        )}
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 pb-10 md:px-6">
        <OnboardingStepper steps={STEPS} current={step} />
        <section className="flex-1">{body}</section>
        <footer className="flex items-center justify-between border-t border-line pt-5">
          {step > 0 ? (
            <Button variant="ghost" onClick={back}>
              Atrás
            </Button>
          ) : (
            <span />
          )}
          {primary}
        </footer>
      </main>
    </div>
  );
}
