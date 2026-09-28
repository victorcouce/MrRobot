"use client";

import type { AgentAvailability } from "../../lib/types";
import { Block, BlockHeader, BlockFooter } from "../ui/Block";
import { Button } from "../ui/Button";
import { clsx } from "../../lib/cx";

interface AgentsStatusBlockProps {
  agents: AgentAvailability[];
  onConfigureDeepSeek?: () => void;
  onConfigureLmStudio?: () => void;
  lastCheckedAt?: string;
}

function StatusDot({ connected }: { connected: boolean }) {
  return (
    <div
      className={clsx(
        "h-2 w-2 rounded-full flex-shrink-0",
        connected ? "bg-success" : "bg-neutral-dot",
      )}
    />
  );
}

function StatusPill({ connected, reason }: { connected: boolean; reason?: string }) {
  if (!connected && (reason?.includes("DEEPSEEK_API_KEY") || reason?.includes("LM Studio"))) {
    return null; // Will show button instead
  }

  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        connected
          ? "bg-success-soft text-success-text"
          : "bg-muted text-ink-4",
      )}
    >
      {connected ? "Conectado" : "No disponible"}
    </span>
  );
}

export function AgentsStatusBlock({
  agents,
  onConfigureDeepSeek,
  onConfigureLmStudio,
  lastCheckedAt,
}: AgentsStatusBlockProps) {
  return (
    <Block>
      <BlockHeader
        title="Agentes"
        meta={lastCheckedAt ? `comprobado ${lastCheckedAt}` : undefined}
      />

      <div className="divide-y divide-line-soft">
        {agents.map((agent) => (
          <div
            key={agent.provider}
            className="flex items-center justify-between px-5 py-4 gap-4"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <StatusDot connected={agent.connected} />
              <span className="font-mono text-sm text-ink font-medium">
                {agent.provider}
              </span>
            </div>

            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="text-xs text-ink-3 text-right">
                {agent.reason || (
                  <>
                    {agent.provider === "codex" && "Suscripción ChatGPT · CLI en PATH"}
                    {agent.provider === "claude" && "CLI en PATH"}
                    {agent.provider === "deepseek" && "DEEPSEEK_API_KEY"}
                    {agent.provider === "lmstudio" && "Servidor local (LM Studio)"}
                  </>
                )}
              </span>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {!agent.connected && agent.provider === "deepseek" && onConfigureDeepSeek ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={onConfigureDeepSeek}
                  className="text-xs"
                >
                  Cómo configurarla
                </Button>
              ) : !agent.connected && agent.provider === "lmstudio" && onConfigureLmStudio ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={onConfigureLmStudio}
                  className="text-xs"
                >
                  Cómo configurarla
                </Button>
              ) : (
                <StatusPill connected={agent.connected} reason={agent.reason} />
              )}
            </div>
          </div>
        ))}
      </div>

      <BlockFooter>
        <span className="text-xs text-ink-4">
          Si un agente agota su cuota, la tarea salta al siguiente de la cadena.
        </span>
      </BlockFooter>
    </Block>
  );
}
