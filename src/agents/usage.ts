import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Tokens consumidos por un intento de agente. `cachedInput` es la parte de
 * `input` servida desde la caché de prefijo del proveedor (DeepSeek
 * `prompt_cache_hit_tokens`, Claude `cache_read_input_tokens`): cuanto mayor,
 * más barato el intento.
 */
export interface TokenUsage {
  input: number;
  cachedInput: number;
  output: number;
  /** Llamadas al modelo que aportaron datos de uso. */
  calls: number;
}

const meter = new AsyncLocalStorage<TokenUsage>();

export function emptyUsage(): TokenUsage {
  return { input: 0, cachedInput: 0, output: 0, calls: 0 };
}

/**
 * Suma el uso de una llamada al medidor del intento en curso. Fuera de
 * `withUsageMeter` no hace nada: los proveedores lo llaman siempre sin saber
 * si alguien mide.
 */
export function recordUsage(usage: Partial<Omit<TokenUsage, "calls">>): void {
  const current = meter.getStore();
  if (!current) return;

  current.input += usage.input ?? 0;
  current.cachedInput += usage.cachedInput ?? 0;
  current.output += usage.output ?? 0;
  current.calls++;
}

/**
 * Ejecuta `fn` con un medidor propio y lo devuelve junto al resultado o al
 * error. El medidor se rellena aunque `fn` falle, para contabilizar también
 * los intentos fallidos (los más caros suelen ser los que agotan el harness).
 */
export async function withUsageMeter<T>(
  fn: () => Promise<T>,
): Promise<{ usage: TokenUsage; result: T } | { usage: TokenUsage; error: unknown }> {
  const usage = emptyUsage();

  try {
    const result = await meter.run(usage, fn);
    return { usage, result };
  } catch (error) {
    return { usage, error };
  }
}

/** El uso de un intento, o `undefined` si ningún proveedor lo reportó. */
export function usageOrUndefined(usage: TokenUsage): TokenUsage | undefined {
  return usage.calls > 0 ? usage : undefined;
}

/** Uso de una respuesta OpenAI-compatible (DeepSeek incluido). */
export function usageFromOpenAI(raw: unknown): Partial<TokenUsage> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const u = raw as Record<string, unknown>;
  const num = (v: unknown): number => (typeof v === "number" ? v : 0);
  const details = u.prompt_tokens_details as Record<string, unknown> | undefined;

  return {
    input: num(u.prompt_tokens),
    // DeepSeek informa `prompt_cache_hit_tokens`; OpenAI, `cached_tokens`.
    cachedInput: num(u.prompt_cache_hit_tokens) || num(details?.cached_tokens),
    output: num(u.completion_tokens),
  };
}

/**
 * Uso del mensaje `result` de `claude --output-format stream-json`. En la API
 * de Anthropic `input_tokens` excluye la caché, así que se suman lectura y
 * escritura de caché para que `input` sea el total procesado.
 */
export function usageFromClaude(raw: unknown): Partial<TokenUsage> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const u = raw as Record<string, unknown>;
  const num = (v: unknown): number => (typeof v === "number" ? v : 0);
  const cacheRead = num(u.cache_read_input_tokens);

  return {
    input: num(u.input_tokens) + cacheRead + num(u.cache_creation_input_tokens),
    cachedInput: cacheRead,
    output: num(u.output_tokens),
  };
}
