import { z } from "zod";

export const generatedTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  type: z.enum([
    "planning",
    "architecture",
    "coding",
    "review",
    "testing",
    "research",
  ]),
  complexity: z.enum(["low", "medium", "high", "critical"]),
  dependsOn: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(z.string()).default([]),
});

export const generatedPlanSchema = z.object({
  summary: z.string().default(""),
  tasks: z.array(generatedTaskSchema).min(1),
});
