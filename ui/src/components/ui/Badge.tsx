import { clsx } from "../../lib/cx";
import type { StatusColor } from "../../lib/status";
import { Spinner } from "./Button";

const COLOR_CLASSES: Record<StatusColor, string> = {
  zinc: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  sky: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
  orange:
    "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300",
  emerald:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  red: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
};

const DOT_CLASSES: Record<StatusColor, string> = {
  zinc: "bg-zinc-400",
  amber: "bg-amber-500",
  sky: "bg-sky-500",
  blue: "bg-blue-500",
  orange: "bg-orange-500",
  emerald: "bg-emerald-500",
  red: "bg-red-500",
};

export function StatusBadge({
  label,
  color,
  pulse = false,
  className,
}: {
  label: string;
  color: StatusColor;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        COLOR_CLASSES[color],
        className,
      )}
    >
      <span
        className={clsx(
          "h-1.5 w-1.5 rounded-full",
          DOT_CLASSES[color],
          pulse && "pulse-dot",
        )}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

export function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded border border-zinc-200 px-1.5 py-0.5 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-400",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function LoadingState({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
      <Spinner className="h-4 w-4" />
      {label ?? "Cargando…"}
    </div>
  );
}
