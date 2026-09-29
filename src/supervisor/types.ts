export type SupervisorDecision =
  | { action: "continue"; reason: string }
  | { action: "replan"; reason: string; instructions?: string }
  | { action: "pause"; reason: string }
  | { action: "fail"; reason: string };
