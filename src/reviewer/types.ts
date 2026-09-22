export type ReviewSeverity = "low" | "medium" | "high" | "critical";

export interface ReviewIssue {
  severity: ReviewSeverity;
  description: string;
}

export interface ReviewResult {
  approved: boolean;
  summary: string;
  issues: ReviewIssue[];
  suggestedFixes?: string[];
  /** El rechazo se debe al propio reviewer (sin respuesta válida), no a la tarea. */
  unavailable?: boolean;
}
