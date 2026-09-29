import { z } from "zod";

export const supervisorDecisionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("continue"), reason: z.string() }),
  z.object({
    action: z.literal("replan"),
    reason: z.string(),
    instructions: z.string().optional(),
  }),
  z.object({ action: z.literal("pause"), reason: z.string() }),
  z.object({ action: z.literal("fail"), reason: z.string() }),
]);
