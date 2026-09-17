import type { ReactNode } from "react";
import { clsx } from "../../lib/cx";

interface BlockProps {
  children: ReactNode;
  className?: string;
}

interface BlockHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

interface BlockContentProps {
  children: ReactNode;
  className?: string;
}

interface BlockFooterProps {
  children: ReactNode;
  className?: string;
}

/**
 * Base Block component for chat thread blocks.
 * Provides consistent styling and structure for inline content blocks.
 */
export function Block({ children, className }: BlockProps) {
  return (
    <div
      className={clsx(
        "rounded-block border border-line bg-surface shadow-block",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Block header with title, optional subtitle, and action buttons.
 */
export function BlockHeader({
  title,
  subtitle,
  actions,
  className,
}: BlockHeaderProps) {
  return (
    <div
      className={clsx(
        "flex items-center justify-between gap-4 border-b border-line-soft px-5 py-4",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        {subtitle && (
          <p className="mt-1 text-sm text-ink-3">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}

/**
 * Block content area for main block content.
 */
export function BlockContent({ children, className }: BlockContentProps) {
  return (
    <div className={clsx("px-5 py-4", className)}>
      {children}
    </div>
  );
}

/**
 * Block footer with metadata and action buttons.
 */
export function BlockFooter({ children, className }: BlockFooterProps) {
  return (
    <div
      className={clsx(
        "flex items-center justify-between gap-4 border-t border-line-soft bg-subtle px-5 py-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Key-value row for displaying metadata.
 */
export function BlockKV({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-3 py-2 text-sm">
      <dt className="text-ink-4">{label}</dt>
      <dd className="text-ink-2">{children}</dd>
    </div>
  );
}

/**
 * Status pill component for block headers.
 */
export function StatusPill({
  status,
}: {
  status: "done" | "failed" | "blocked" | "running" | "todo";
}) {
  const statusConfig = {
    done: "bg-success-soft text-success-text",
    failed: "bg-danger-soft text-danger-text",
    blocked: "bg-warning-soft text-warning-text",
    running: "bg-primary-soft text-primary-soft-text",
    todo: "bg-muted text-ink-3",
  };

  const statusLabels = {
    done: "Hecha",
    failed: "Fallida",
    blocked: "Bloqueada",
    running: "En curso",
    todo: "Pendiente",
  };

  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        statusConfig[status],
      )}
    >
      {statusLabels[status]}
    </span>
  );
}
