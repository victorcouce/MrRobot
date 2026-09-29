"use client";

import { useEffect, type ReactNode } from "react";
import { clsx } from "../../lib/cx";
import { CloseIcon } from "./icons";

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink/30 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        className={clsx(
          "flex w-full flex-col overflow-hidden rounded-[18px] border border-line bg-surface shadow-modal",
          width,
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-1">
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
            {description && (
              <p className="mt-1 text-[13.5px] leading-normal text-ink-3">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring -mr-1.5 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-btn text-ink-4 hover:bg-muted hover:text-ink"
            aria-label="Cerrar"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-6 py-4">{children}</div>

        {footer && (
          <div className="flex items-center justify-between gap-2 border-t border-line bg-subtle px-6 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
