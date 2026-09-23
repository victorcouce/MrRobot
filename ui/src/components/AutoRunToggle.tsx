"use client";

import { clsx } from "@/lib/cx";

interface AutoRunToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}

/**
 * Interruptor de ejecución automática del compositor: el plan inicial se
 * ejecuta en cuanto se genera, sin esperar a que el usuario lo apruebe.
 */
export function AutoRunToggle({ enabled, onChange, disabled }: AutoRunToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label="Ejecución automática"
      title="Ejecución automática: lanza los agentes en cuanto el plan está listo, sin pedirte que lo revises."
      onClick={() => onChange(!enabled)}
      disabled={disabled}
      className={clsx(
        "focus-ring inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-chip border px-2.5 text-[12.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        enabled
          ? "border-primary bg-primary-soft text-ink ring-2 ring-primary-soft"
          : "border-line-strong bg-surface text-ink-2 hover:bg-muted",
      )}
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill={enabled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M7 4v16l13-8z" />
      </svg>
      <span>Ejecución automática</span>
    </button>
  );
}
