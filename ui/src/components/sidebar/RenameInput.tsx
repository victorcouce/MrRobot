"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Edición en la propia fila, como en ChatGPT: Enter o salir del campo guarda,
 * Escape cancela. Un nombre vacío o sin cambios no llama a `onSave`.
 */
export function RenameInput({
  initial,
  label,
  onSave,
  onCancel,
  className,
}: {
  initial: string;
  label: string;
  onSave: (value: string) => void;
  onCancel: () => void;
  className?: string;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  function commit() {
    if (done.current) return;
    done.current = true;
    const next = value.trim();
    if (next && next !== initial.trim()) onSave(next);
    else onCancel();
  }

  return (
    <input
      ref={ref}
      value={value}
      aria-label={label}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          done.current = true;
          onCancel();
        }
      }}
      className={
        className ??
        "h-7 min-w-0 flex-1 rounded-md border border-primary bg-surface px-1.5 text-[13px] text-ink outline-none ring-2 ring-primary-soft"
      }
    />
  );
}
