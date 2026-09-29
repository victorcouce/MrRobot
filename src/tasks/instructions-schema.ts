import { z } from "zod";

export const taskInstructionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("proceed"),
    message: z.string().min(1),
  }),
  z.object({
    action: z.literal("ask"),
    message: z.string().min(1),
    questions: z.array(z.string().min(1)).min(1).max(3),
  }),
]);
