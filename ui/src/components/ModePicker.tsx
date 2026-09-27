"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ListChecks, Play, Zap, type LucideIcon } from "lucide-react";
import { clsx } from "@/lib/cx";

export type ComposerMode = "review" | "auto" | "fast";

interface ModeOption {
  id: ComposerMode;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Color del icono. */
  tone: string;
}

/**
 * Modo rápido y ejecución automática fusionados en tres modos. «Rápido» implica
 * también la ejecución automática: sin tests ni reviewer no hay plan que revisar.
 */
export const COMPOSER_MODES: ModeOption[] = [
  {
    id: "review",
    label: "Revisar el plan",
    description: "Planifica y espera tu visto bueno",
    icon: ListChecks,
    tone: "text-ink-4",
  },
  {
    id: "auto",
    label: "Automático",
    description: "Ejecuta en cuanto el plan está listo",
    icon: Play,
    tone: "text-success",
  },
  {
    id: "fast",
    label: "Rápido",
    description: "Sin tests ni reviewer, y se ejecuta solo",
    icon: Zap,
    tone: "text-warning",
  },
];

/** Config del proyecto que corresponde a cada modo (vacía en «Revisar el plan»). */
export function modeConfig(mode: ComposerMode): { fastMode?: true; autoRun?: true } {
  if (mode === "fast") return { fastMode: true, autoRun: true };
  if (mode === "auto") return { autoRun: true };
  return {};
}

/** Los dos flags explícitos, para cambiar el modo de un proyecto que ya existe. */
export function modeFlags(mode: ComposerMode): { fastMode: boolean; autoRun: boolean } {
  return { fastMode: mode === "fast", autoRun: mode !== "review" };
}

/** Modo que corresponde a la config de un proyecto. */
export function modeFromConfig(
  config: { fastMode?: boolean | undefined; autoRun?: boolean | undefined } | undefined,
): ComposerMode {
  if (config?.fastMode) return "fast";
  if (config?.autoRun) return "auto";
  return "review";
}

interface ModePickerProps {
  value: ComposerMode;
  onChange: (mode: ComposerMode) => void;
  disabled?: boolean | undefined;
}

export function ModePicker({ value, onChange, disabled }: ModePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const current = COMPOSER_MODES.find((mode) => mode.id === value) ?? COMPOSER_MODES[0]!;

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

  return (
    <div ref={containerRef} className="relative inline-block shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={`Modo: ${current.label}. Cambiar modo`}
        className={clsx(
          "focus-ring flex h-[34px] items-center gap-[7px] whitespace-nowrap rounded-btn px-2.5 text-[13px] text-ink-2 transition-colors hover:bg-muted disabled:opacity-50",
          isOpen && "bg-muted",
        )}
      >
        <current.icon aria-hidden className={clsx("h-[15px] w-[15px] shrink-0", current.tone)} strokeWidth={1.8} />
        <span>{current.label}</span>
        <ChevronDown className="h-3 w-3 text-ink-4" strokeWidth={2} aria-hidden />
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Modo de ejecución"
          className="absolute bottom-full left-0 z-50 mb-2.5 w-[320px] rounded-[14px] border border-line-strong bg-surface p-1.5 shadow-modal"
        >
          {COMPOSER_MODES.map((mode) => {
            const selected = mode.id === value;
            return (
              <button
                key={mode.id}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  onChange(mode.id);
                  setIsOpen(false);
                }}
                className="focus-ring grid w-full grid-cols-[16px_minmax(0,1fr)_14px] items-center gap-3 rounded-btn p-2.5 text-left hover:bg-sidebar"
              >
                <mode.icon aria-hidden className={clsx("h-4 w-4", mode.tone)} strokeWidth={1.8} />
                <span className="flex flex-col gap-px">
                  <span className="text-[13px] text-ink">{mode.label}</span>
                  <span className="text-[11.5px] text-ink-4">{mode.description}</span>
                </span>
                {selected && <Check className="h-3.5 w-3.5 text-ink" strokeWidth={2} aria-hidden />}
              </button>
            );
          })}
          <div className="mt-1 border-t border-line-soft px-2.5 pb-1 pt-2 text-[11.5px] leading-[1.45] text-ink-3">
            Usa los agentes marcados en{" "}
            <Link href="/settings" className="text-primary-soft-text hover:text-ink">
              Ajustes
            </Link>
            .
          </div>
        </div>
      )}
    </div>
  );
}
