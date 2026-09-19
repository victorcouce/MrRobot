import type { AvailabilityReason } from "./availability.js";
import { errorMessage } from "./fallback.js";

/**
 * Política de reintento cuando *todos* los candidatos de una cadena se agotan
 * por límite del proveedor (rate limit o cuota/sesión). A diferencia de un
 * fallo transitorio, aquí no tiene sentido insistir de inmediato: se espera a
 * que el límite se reponga y se vuelve a recorrer la cadena completa.
 */
export interface LimitRetryPolicy {
  /** Veces que se re-recorre la cadena completa al agotarse por límite. */
  maxLimitRetries: number;
  /** Espera base (ms) cuando el proveedor no indica un `retry after`. */
  baseDelayMs: number;
  /** Tope superior de la espera (ms), también aplicado al `retry after`. */
  maxDelayMs: number;
}

export const DEFAULT_LIMIT_RETRY: LimitRetryPolicy = {
  maxLimitRetries: 3,
  baseDelayMs: 30_000,
  maxDelayMs: 15 * 60_000,
};

export function resolveLimitRetry(
  policy?: Partial<LimitRetryPolicy>,
): LimitRetryPolicy {
  return { ...DEFAULT_LIMIT_RETRY, ...policy };
}

/** Solo los límites del proveedor se reintentan esperando; auth o CLI no. */
export function isLimitReason(reason: AvailabilityReason | undefined): boolean {
  return reason === "rate_limit" || reason === "usage_limit";
}

const RETRY_AFTER_PATTERN =
  /retry[-\s]?after[\s:=]*(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|sec(?:onds?)?|m|min(?:utes?)?|h|hours?)?/i;

/**
 * Extrae el `Retry-After` del mensaje de error si el proveedor lo incluye.
 * Acepta `retry after 30`, `retry-after: 30`, `retry after 2m`, etc. Sin unidad
 * se interpreta en segundos (convención HTTP).
 */
export function parseRetryAfterMs(error: unknown): number | undefined {
  const match = RETRY_AFTER_PATTERN.exec(errorMessage(error));

  if (!match) {
    return undefined;
  }

  const value = Number(match[1]);

  if (!Number.isFinite(value) || value < 0) {
    return undefined;
  }

  const unit = match[2]?.toLowerCase() ?? "s";

  if (unit.startsWith("ms") || unit.startsWith("millisecond")) {
    return value;
  }

  if (unit.startsWith("h")) {
    return value * 3_600_000;
  }

  if (unit.startsWith("m")) {
    return value * 60_000;
  }

  return value * 1_000;
}

/**
 * Espera para el reintento `cycle` (0-based): usa el `retry after` del error si
 * existe y, si no, un backoff exponencial. Ambos acotados por `maxDelayMs`.
 */
export function limitRetryDelayMs(
  cycle: number,
  error: unknown,
  policy: LimitRetryPolicy,
): number {
  const retryAfter = parseRetryAfterMs(error);

  if (retryAfter !== undefined) {
    return Math.min(retryAfter, policy.maxDelayMs);
  }

  return Math.min(policy.baseDelayMs * 2 ** cycle, policy.maxDelayMs);
}

/** Espera cancelable: si `signal` aborta durante la espera, rechaza. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Ejecución cancelada por el usuario."));
      return;
    }

    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new Error("Ejecución cancelada por el usuario."));
    };

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
