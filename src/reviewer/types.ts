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
}
