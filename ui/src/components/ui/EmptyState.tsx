import type { ReactNode } from "react";
import { clsx } from "../../lib/cx";

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-zinc-300 px-6 py-16 text-center dark:border-zinc-700",
        className,
      )}
    >
      <h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-200">
        {title}
      </h3>
      {description && (
        <p className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
          {description}
        </p>
      )}
      {action}
    </div>
  );
}
