"use client";

import { useCallback, useRef, useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { AgentSpec } from "@/lib/types";
import { agentLabel } from "@/lib/api";

interface ChatAgentSelectorProps {
  allowedAgents?: AgentSpec[];
  availableAgents: AgentSpec[];
  onSelect: (agents: AgentSpec[]) => void;
  disabled?: boolean;
}

export function ChatAgentSelector({
  allowedAgents = [],
  availableAgents,
  onSelect,
  disabled,
}: ChatAgentSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [isOpen]);

  const handleToggle = useCallback(
    (agent: AgentSpec) => {
      const isSelected = allowedAgents.some(
        (a) =>
          a.provider === agent.provider &&
          (a.provider === "codex" ||
            (a as any).model === (agent as any).model),
      );

      const updated = isSelected
        ? allowedAgents.filter(
            (a) =>
              !(
                a.provider === agent.provider &&
                (a.provider === "codex" ||
                  (a as any).model === (agent as any).model)
              ),
          )
        : [...allowedAgents, agent];

      onSelect(updated);
    },
    [allowedAgents, onSelect],
  );

  const selectedLabels = allowedAgents.map((a) => agentLabel(a));

  return (
    <div ref={containerRef} className="relative inline-block">
      <Button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        variant="secondary"
        size="sm"
        className="flex items-center gap-2"
      >
        {selectedLabels.length > 0 ? (
          <span className="text-sm">{selectedLabels.join(", ")}</span>
        ) : (
          <span className="text-sm text-ink-3">Todos los agentes</span>
        )}
        <ChevronDown className="h-4 w-4" />
      </Button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-56 rounded-lg bg-surface border border-line shadow-lg z-50 p-2">
          <div className="space-y-2">
            {availableAgents.length === 0 ? (
              <div className="text-sm text-ink-3 px-3 py-2">
                Sin agentes disponibles
              </div>
            ) : (
              availableAgents.map((agent) => {
                const isSelected = allowedAgents.some(
                  (a) =>
                    a.provider === agent.provider &&
                    (a.provider === "codex" ||
                      (a as any).model === (agent as any).model),
                );

                return (
                  <label
                    key={`${agent.provider}-${(agent as any).model ?? ""}`}
                    className="flex items-center gap-2 p-2 hover:bg-muted rounded-md cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggle(agent)}
                      className="w-4 h-4 rounded border-line"
                    />
                    <span className="text-sm">{agentLabel(agent)}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
