import { clsx } from "../../lib/cx";

/** Pasos del asistente con el actual resaltado y los anteriores marcados. */
export function OnboardingStepper({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <ol className="flex items-center gap-2" aria-label="Pasos">
      {steps.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li
            key={label}
            aria-current={active ? "step" : undefined}
            className="flex min-w-0 flex-1 flex-col gap-1.5"
          >
            <span
              className={clsx(
                "h-1 rounded-full transition-colors",
                done || active ? "bg-ink" : "bg-line-strong",
              )}
            />
            <span
              className={clsx(
                "hidden truncate text-[11.5px] font-medium sm:block",
                active ? "text-ink" : "text-ink-4",
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
