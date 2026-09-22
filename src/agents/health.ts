import { parseRetryAfterMs } from "./limit-retry.js";
import { agentKey } from "./selector.js";
import type { AgentCandidate } from "./types.js";

/**
 * Cuarentena de agentes que cayeron por límite del proveedor (rate limit o
 * cuota/sesión). A diferencia de `limit-retry` —que reintenta la cadena dentro
 * de la misma tarea—, esta memoria es transversal: cuando un agente se agota y
 * otro candidato completa la tarea, el agotado pasa al final de la cadena en
 * las siguientes ejecuciones hasta que se reponga el límite. Así el motor no
 * vuelve a empezar por el agente que falló y sigue con el que funcionó.
 *
 * La caducidad se toma del `retry after` del proveedor si lo indica; si no, de
 * `cooldownMs`. Nunca es menor que `cooldownMs`, de modo que el agente que
 * funciona siga yendo primero aunque el proveedor no dé pistas.
 */
export interface AgentHealthOptions {
  /** Cuarentena mínima de un agente al agotarse (ms). */
  cooldownMs?: number;
  /** Tope de la cuarentena, también aplicado al `retry after` (ms). */
  maxCooldownMs?: number;
  /** Reloj inyectable para tests. */
  now?: () => number;
}

export const DEFAULT_LIMIT_COOLDOWN_MS = 5 * 60_000;
// Un límite de sesión puede tardar horas en reponerse; el "resets HH:MM" del
// proveedor se respeta hasta este tope.
export const MAX_LIMIT_COOLDOWN_MS = 6 * 60 * 60_000;

export class AgentHealth {
  private readonly limited = new Map<string, number>();
  private readonly cooldownMs: number;
  private readonly maxCooldownMs: number;
  private readonly now: () => number;

  constructor(options: AgentHealthOptions = {}) {
    this.cooldownMs = options.cooldownMs ?? DEFAULT_LIMIT_COOLDOWN_MS;
    this.maxCooldownMs = Math.max(
      this.cooldownMs,
      options.maxCooldownMs ?? MAX_LIMIT_COOLDOWN_MS,
    );
    this.now = options.now ?? Date.now;
  }

  /**
   * Marca un agente como agotado. Devuelve los ms de cuarentena aplicados (para
   * logging) o 0 si ya estaba en cuarentena por más tiempo.
   */
  markLimited(agent: AgentCandidate, error?: unknown): number {
    const retryAfter = parseRetryAfterMs(error) ?? 0;
    const cooldown = Math.min(
      Math.max(retryAfter, this.cooldownMs),
      this.maxCooldownMs,
    );
    const until = this.now() + cooldown;
    const key = agentKey(agent);
    const current = this.limited.get(key);

    if (current !== undefined && current >= until) {
      return 0;
    }

    this.limited.set(key, until);
    return cooldown;
  }

  /** El agente volvió a responder: se levanta su cuarentena. */
  recordSuccess(agent: AgentCandidate): void {
    this.limited.delete(agentKey(agent));
  }

  isLimited(agent: AgentCandidate): boolean {
    const key = agentKey(agent);
    const until = this.limited.get(key);

    if (until === undefined) {
      return false;
    }

    if (until <= this.now()) {
      this.limited.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Reordena la cadena: primero los agentes disponibles (orden original) y al
   * final los que están en cuarentena. No elimina ninguno: si no hay
   * alternativas, el agotado sigue siendo el último recurso.
   */
  order(chain: AgentCandidate[]): AgentCandidate[] {
    const available: AgentCandidate[] = [];
    const limited: AgentCandidate[] = [];

    for (const candidate of chain) {
      if (this.isLimited(candidate)) {
        limited.push(candidate);
      } else {
        available.push(candidate);
      }
    }

    return limited.length === 0 ? chain : [...available, ...limited];
  }

  reset(): void {
    this.limited.clear();
  }
}
