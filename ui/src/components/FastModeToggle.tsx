"use client";

import { clsx } from "@/lib/cx";

interface FastModeToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}

/**
 * Interruptor del modo rápido del compositor: el proyecto se planifica sin
 * tareas de tests y sus tareas no pasan por checks ni reviewer.
 */
export function FastModeToggle({ enabled, onChange, disabled }: FastModeToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label="Modo rápido"
      title="Modo rápido: planifica sin tests ni reviewers. Más rápido y barato, con menos verificación."
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
        <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
      </svg>
      <span>Modo rápido</span>
    </button>
  );
}
