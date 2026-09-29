import type { ReactNode } from "react";
import { clsx } from "../../lib/cx";

/**
 * Chip neutro. Réplica de `.chip` de `ui/design/screens`.
 * `mono` para IDs, tipos, agentes, rutas y commits.
 */
export function Chip({
  children,
  mono = false,
  className,
}: {
  children: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-[6px] bg-muted px-[7px] whitespace-nowrap text-ink-2",
        mono ? "font-mono text-[11.5px]" : "text-[12px]",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Pill de estado con color de fondo/texto libres. Réplica de `.pill`.
 */
export function Pill({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-full px-2 text-[12px] font-medium whitespace-nowrap",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Avatar cuadrado oscuro del planner/MrRobot: dos puntos claros.
 */
export function RobotAvatar({ size = 20 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center gap-[3px] rounded-[6px] bg-ink"
      style={{ width: size, height: size }}
    >
      <i className="block h-[3px] w-[3px] rounded-[2px] bg-bg" />
      <i className="block h-[3px] w-[3px] rounded-[2px] bg-bg" />
    </span>
  );
}
