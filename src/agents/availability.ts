import { errorMessage } from "./fallback.js";

export type AvailabilityReason =
  | "rate_limit"
  | "usage_limit"
  | "auth"
  | "cli_missing"
  | "network"
  | "unknown";

export interface AgentAvailability {
  available: boolean;
  reason?: AvailabilityReason;
}

const PATTERNS: Array<[AvailabilityReason, string[]]> = [
  [
    "usage_limit",
    ["session limit", "usage limit", "quota", "insufficient_quota", "out of credits"],
  ],
  ["rate_limit", ["rate limit", "rate_limit", "too many requests", "429"]],
  [
    "auth",
    ["api key", "apikey", "unauthorized", "401", "403", "forbidden", "authentication"],
  ],
  ["cli_missing", ["enoent", "command not found", "spawn "]],
  [
    "network",
    [
      "network",
      "econnreset",
      "econnrefused",
      "enotfound",
      "eai_again",
      "timeout",
      "socket hang up",
    ],
  ],
];

export function classifyAvailability(error: unknown): AgentAvailability {
  const message = errorMessage(error);
  const lowerMessage = message.toLowerCase();

  // Errores del harness o sandbox no son indisponibilidad del proveedor
  const NEVER_UNAVAILABLE = ["[harness]", "[sandbox]"];
  if (NEVER_UNAVAILABLE.some((marker) => message.includes(marker))) {
    return { available: true };
  }

  for (const [reason, patterns] of PATTERNS) {
    if (patterns.some((pattern) => lowerMessage.includes(pattern))) {
      return { available: false, reason };
    }
  }

  return { available: true };
}
