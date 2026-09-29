"use client";

import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { clsx } from "../../lib/cx";

export function Tooltip({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(
    null,
  );

  function show() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setPosition({ top: rect.top + rect.height / 2, left: rect.right + 8 });
  }

  function hide() {
    setPosition(null);
  }

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className={clsx("flex", className)}
      >
        {children}
      </span>
      {position &&
        createPortal(
          <span
            role="tooltip"
            style={{ top: position.top, left: position.left }}
            className="pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-md border border-line bg-white px-2.5 py-1 text-xs font-medium text-ink shadow-md"
          >
            {label}
          </span>,
          document.body,
        )}
    </>
  );
}
