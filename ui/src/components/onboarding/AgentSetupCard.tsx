"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "../ui/Button";
import {
  CLI_LOGIN_COMMANDS,
  isCliProvider,
  type SetupResult,
  type useAgentSetup,
} from "../../lib/agent-setup";
import type { AgentAvailability } from "../../lib/types";
import { ResultMessage, StatusPill } from "./StatusPill";

const DESCRIPTIONS: Record<string, string> = {
  codex: "Usa tu suscripción de ChatGPT. Ideal para tareas de código complejas.",
  claude: "Usa tu suscripción de Claude. Planner, reviewer, supervisor y tareas.",
  deepseek: "API de pago por uso. Solo necesita una clave.",
  lmstudio: "Modelos locales en tu máquina, sin coste. Abre LM Studio con el servidor activo.",
};

const INPUT_CLASSES =
  "h-8 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 font-mono text-xs text-ink outline-none focus:border-primary";

function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2">
      <code className="truncate font-mono text-xs text-ink">$ {command}</code>
      <button
        type="button"
        aria-label={`Copiar «${command}»`}
        className="focus-ring rounded p-1 text-ink-3 hover:text-ink"
        onClick={() => {
          void navigator.clipboard?.writeText(command).then(
            () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            },
            () => {},
          );
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

/** Tarjeta de un proveedor: estado y lo necesario para conectarlo. */
export function AgentSetupCard({
  agent,
  setup,
  onRecheck,
  rechecking,
}: {
  agent: AgentAvailability;
  setup: ReturnType<typeof useAgentSetup>;
  onRecheck: () => void;
  rechecking: boolean;
}) {
  const [value, setValue] = useState("");
  const result: SetupResult | undefined = setup.results[agent.provider];
  const busy = setup.busy === agent.provider;

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">{agent.label}</h3>
          <p className="mt-0.5 text-xs text-ink-3">{DESCRIPTIONS[agent.provider]}</p>
        </div>
        <StatusPill ok={agent.connected} />
      </div>

      {!agent.connected && agent.reason && (
        <p className="text-xs text-ink-4">{agent.reason}</p>
      )}

      {isCliProvider(agent.provider) && (
        <div className="space-y-2">
          {!agent.connected && (
            <Button
              size="sm"
              variant="secondary"
              loading={busy}
              onClick={() => {
                if (isCliProvider(agent.provider)) void setup.installCli(agent.provider);
              }}
            >
              Instalar CLI
            </Button>
          )}
          <p className="text-xs text-ink-3">
            {agent.connected ? "Si aún no has iniciado sesión, hazlo" : "Después, inicia sesión"} una vez
            en tu terminal:
          </p>
          <CopyCommand command={CLI_LOGIN_COMMANDS[agent.provider]} />
          <Button size="sm" variant="ghost" loading={rechecking} onClick={onRecheck}>
            Comprobar de nuevo
          </Button>
        </div>
      )}

      {agent.provider === "deepseek" && (
        <form
          className="flex gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const outcome = await setup.checkDeepSeek(value);
            if (outcome.ok) setValue("");
          }}
        >
          <input
            type="password"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="DEEPSEEK_API_KEY"
            aria-label="Clave de DeepSeek"
            autoComplete="off"
            className={INPUT_CLASSES}
          />
          <Button type="submit" size="sm" variant="secondary" loading={busy} disabled={!value.trim()}>
            Validar y guardar
          </Button>
        </form>
      )}

      {agent.provider === "lmstudio" && (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void setup.checkLmStudio(value);
          }}
        >
          <input
            type="url"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="http://localhost:1234/v1"
            aria-label="URL del servidor de LM Studio"
            className={INPUT_CLASSES}
          />
          <Button type="submit" size="sm" variant="secondary" loading={busy}>
            Conectar
          </Button>
        </form>
      )}

      {result && <ResultMessage {...result} />}
    </div>
  );
}
