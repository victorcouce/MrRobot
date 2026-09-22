import { classifyAvailability } from "./availability.js";
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
 * Un rate limit es por modelo, pero un límite de uso o cuota (la sesión de la
 * suscripción de Claude, el saldo de DeepSeek) es de la cuenta: cae todo el
 * proveedor. El 19-09, tras agotarse Haiku, se probaron igualmente Sonnet y
 * Opus en cada tarea para fallar igual.
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
    const key =
      classifyAvailability(error).reason === "usage_limit"
        ? accountKey(agent)
        : agentKey(agent);
    const current = this.limited.get(key);

    if (current !== undefined && current >= until) {
      return 0;
    }

    this.limited.set(key, until);
    return cooldown;
  }

  /** El agente volvió a responder: se levanta su cuarentena y la de su cuenta. */
  recordSuccess(agent: AgentCandidate): void {
    this.limited.delete(agentKey(agent));
    this.limited.delete(accountKey(agent));
  }

  isLimited(agent: AgentCandidate): boolean {
    return this.isActive(agentKey(agent)) || this.isActive(accountKey(agent));
  }

  /**
   * La cuenta entera del proveedor está agotada (límite de uso, no de ritmo):
   * probar otro modelo del mismo proveedor fallará igual.
   */
  isAccountLimited(agent: AgentCandidate): boolean {
    return this.isActive(accountKey(agent));
  }

  private isActive(key: string): boolean {
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

function accountKey(agent: AgentCandidate): string {
  return `${agent.provider}:*`;
}

/**
 * Salta un candidato cuya cuenta está agotada (límite de uso) si queda en la
 * cadena alguno de otra cuenta: probarlo solo costaría otra llamada fallida.
 * Si todos están agotados, se prueban igualmente como último recurso.
 */
export function skipAccountLimited(
  candidate: AgentCandidate,
  chain: AgentCandidate[],
  health: AgentHealth | undefined,
): boolean {
  if (!health?.isAccountLimited(candidate)) return false;
  return chain.some((other) => !health.isAccountLimited(other));
}
