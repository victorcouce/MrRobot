"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Cpu } from "lucide-react";
import type { AgentAvailability, AgentProvider, AgentSpec } from "@/lib/types";
import { CHAT_AGENT_OPTIONS, canWriteFiles, hasFileWritingAgent, sameAgent } from "@/lib/agents";

interface ChatAgentSelectorProps {
  /** Agentes permitidos del chat. Vacío o ausente = todos. */
  allowedAgents?: AgentSpec[];
  /** Disponibilidad por proveedor (`info.agents` del backend). */
  agentAvailability?: AgentAvailability[];
  onSelect: (agents: AgentSpec[]) => void;
  disabled?: boolean;
}

const TOTAL = CHAT_AGENT_OPTIONS.length;

function availabilityLabel(reason: string | undefined): string {
  if (!reason) return "no disponible";
  if (/clave|api key|deepseek/i.test(reason)) return "sin clave";
  return "no disponible";
}

export function ChatAgentSelector({
  allowedAgents,
  agentAvailability = [],
  onSelect,
  disabled,
}: ChatAgentSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Sin lista explícita el backend no restringe: todos los agentes valen.
  const restricted = Boolean(allowedAgents && allowedAgents.length > 0);
  const isSelected = useCallback(
    (spec: AgentSpec) =>
      restricted
        ? (allowedAgents ?? []).some((agent) => sameAgent(agent, spec))
        : true,
    [restricted, allowedAgents],
  );

  const selectedCount = CHAT_AGENT_OPTIONS.filter((option) =>
    isSelected(option.spec),
  ).length;

  const currentSelection = restricted
    ? (allowedAgents ?? [])
    : CHAT_AGENT_OPTIONS.map((option) => option.spec);
  const fileWriterCount = currentSelection.filter(canWriteFiles).length;

  const availabilityFor = (provider: AgentProvider) =>
    agentAvailability.find((agent) => agent.provider === provider);
  const isConnected = (provider: AgentProvider) =>
    availabilityFor(provider)?.connected ?? true;

  const handleToggle = (spec: AgentSpec) => {
    const current = currentSelection;

    if (isSelected(spec)) {
      // Nunca dejar la lista vacía: el backend la interpreta como "sin filtro".
      if (current.length <= 1) return;
      const next = current.filter((agent) => !sameAgent(agent, spec));
      // Siempre debe quedar un agente que escriba archivos (Codex o Claude).
      if (!hasFileWritingAgent(next)) return;
      onSelect(next);
    } else {
      onSelect([...current, spec]);
    }
  };

  const deepseekDown = !isConnected("deepseek");

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={`Agentes de este chat: ${selectedCount} de ${TOTAL} marcados`}
        className={`focus-ring inline-flex h-7 items-center gap-1.5 rounded-chip border bg-surface px-2.5 text-[12.5px] text-ink-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          isOpen
            ? "border-primary ring-2 ring-primary-soft"
            : "border-line-strong hover:bg-muted"
        }`}
      >
        <Cpu className="h-3.5 w-3.5" aria-hidden />
        Agentes
        <span className="font-mono text-[11px] tabular-nums text-ink-4" aria-hidden>
          {selectedCount}/{TOTAL}
        </span>
        <ChevronDown className="h-3 w-3" aria-hidden />
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Agentes de este chat"
          className="absolute bottom-full left-0 z-50 mb-2 w-[300px] rounded-[14px] border border-line-strong bg-surface p-2 shadow-modal"
        >
          <div className="flex items-baseline justify-between px-1.5 pb-2 pt-1">
            <span className="text-[13px] font-semibold text-ink">
              Agentes de este chat
            </span>
            <span className="text-xs text-ink-4">
              {selectedCount} de {TOTAL}
            </span>
          </div>

          {CHAT_AGENT_OPTIONS.map((option) => {
            const connected = isConnected(option.spec.provider);
            const selected = isSelected(option.spec);
            const onlySelected = selected && selectedCount <= 1;
            const locksFileWriter =
              selected && canWriteFiles(option.spec) && fileWriterCount <= 1;
            const locked = !connected || onlySelected || locksFileWriter;

            return (
              <label
                key={option.choice}
                title={
                  locksFileWriter
                    ? "Debe quedar al menos un agente que escriba archivos (Codex o Claude)."
                    : undefined
                }
                className={`grid h-[38px] grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg px-2 text-[13px] ${
                  connected
                    ? "cursor-pointer hover:bg-sidebar"
                    : "cursor-not-allowed"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={locked}
                  onChange={() => handleToggle(option.spec)}
                  className="h-4 w-4 rounded border-line accent-primary disabled:cursor-not-allowed"
                />
                <span
                  className={`truncate font-mono ${
                    connected ? "text-ink" : "text-ink-4"
                  }`}
                >
                  {option.label}
                </span>
                <span className="text-xs text-ink-4">
                  {connected
                    ? option.hint
                    : availabilityLabel(availabilityFor(option.spec.provider)?.reason)}
                </span>
              </label>
            );
          })}

          <div className="mt-1.5 border-t border-line-soft px-1.5 pb-0.5 pt-2.5 text-xs leading-[1.45] text-ink-3">
            {fileWriterCount === 0 ? (
              <span className="text-danger-text">
                Añade Codex o Claude: sin un agente que escriba archivos, las
                tareas de código no podrán completarse.
              </span>
            ) : (
              <>
                Solo se usan estos agentes y sus relevos si alguno falla.{" "}
                {deepseekDown && (
                  <Link
                    href="/settings"
                    className="text-primary-soft-text underline hover:text-primary-hover"
                  >
                    Conectar DeepSeek en Ajustes
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
