import { clsx } from "../../lib/cx";

export function StatusPill({ ok, label }: { ok: boolean; label?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium",
        ok ? "bg-success-soft text-success-text" : "bg-muted text-ink-4",
      )}
    >
      {label ?? (ok ? "✓ Conectado" : "No conectado")}
    </span>
  );
}

export function ResultMessage({ ok, message }: { ok: boolean; message: string }) {
  return (
    <p
      role="status"
      className={clsx("text-xs", ok ? "text-success-text" : "text-danger-text")}
    >
      {message}
    </p>
  );
}
