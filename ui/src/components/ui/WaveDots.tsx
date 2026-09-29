import { clsx } from "../../lib/cx";

/**
 * Tres puntos animados como una ola: indican que hay una acción en proceso
 * (p. ej. una tarea en curso, justo después del estado "started").
 */
export function WaveDots({
  className,
  label,
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span
      className={clsx("inline-flex items-center gap-0.5", className)}
      role="status"
      aria-label={label ?? "En proceso"}
    >
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="wave-dot"
          style={{ animationDelay: `${index * 0.15}s` }}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}
