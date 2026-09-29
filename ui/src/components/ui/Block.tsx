import type { ReactNode } from "react";
import { clsx } from "../../lib/cx";

interface BlockProps {
  children: ReactNode;
  className?: string;
}

interface BlockHeaderProps {
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** Sin borde inferior (cabeceras que se funden con el contenido). */
  border?: boolean;
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
 * Bloque base del hilo: tarjeta blanca con borde `line` y sombra suave.
 * Réplica de `.block` de `ui/design/screens`.
 */
export function Block({ children, className }: BlockProps) {
  return (
    <div
      className={clsx(
        "overflow-hidden rounded-block border border-line bg-surface shadow-block",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Cabecera de bloque: título inline (con chips), metadatos y acciones a la
 * derecha. Réplica de `.bhead` / `.btitle`.
 */
export function BlockHeader({
  title,
  meta,
  actions,
  className,
  border = true,
}: BlockHeaderProps) {
  return (
    <div
      className={clsx(
        "flex items-center justify-between gap-4 px-[18px] py-3 pr-3.5",
        border && "border-b border-line",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5 text-sm font-semibold text-ink">
        <span className="truncate">{title}</span>
        {meta && (
          <span className="truncate text-[12.5px] font-normal text-ink-4">
            {meta}
          </span>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      )}
    </div>
  );
}

/**
 * Cuerpo de bloque. El padding por defecto replica el de los diseños; se puede
 * sobreescribir con `className`.
 */
export function BlockContent({ children, className }: BlockContentProps) {
  return <div className={clsx("px-[18px] py-4", className)}>{children}</div>;
}

/**
 * Pie de bloque: fondo `subtle`, borde superior. Réplica de `.bfoot`.
 */
export function BlockFooter({ children, className }: BlockFooterProps) {
  return (
    <div
      className={clsx(
        "flex items-center justify-between gap-4 border-t border-line bg-subtle px-[18px] py-2.5 pr-3.5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Fila clave/valor para metadatos. Réplica de `.kv` de 4-1.
 */
export function BlockKV({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-3 py-[7px] text-[13px]">
      <dt className="text-ink-4">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}

/**
 * Pill de estado para cabeceras de bloque.
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
        "inline-flex h-[22px] items-center rounded-full px-2 text-xs font-medium",
        statusConfig[status],
      )}
    >
      {statusLabels[status]}
    </span>
  );
}
