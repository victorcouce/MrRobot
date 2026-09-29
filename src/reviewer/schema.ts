import { z } from "zod";

export const reviewResultSchema = z.object({
  approved: z.boolean(),
  summary: z.string().default(""),
  issues: z
    .array(
      z.object({
        severity: z.enum(["low", "medium", "high", "critical"]),
        description: z.string().min(1),
      }),
    )
    .default([]),
  suggestedFixes: z.array(z.string()).optional(),
});
