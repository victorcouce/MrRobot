"use client";

import { clsx } from "../../lib/cx";

export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
}

/**
 * Control segmentado de la cabecera de los bloques Plan y Tablero.
 * Réplica de `.seg` de `ui/design/screens`.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  label?: string;
}) {
  return (
    <div
      aria-label={label}
      className="inline-flex gap-0.5 rounded-[9px] bg-muted p-[3px]"
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={clsx(
            "focus-ring h-[26px] rounded-[7px] px-2.5 text-[12.5px] transition-colors",
            value === option.id
              ? "bg-surface font-medium text-ink shadow-sm"
              : "text-ink-3 hover:text-ink-2",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
