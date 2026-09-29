import { z } from "zod";

export const grillQuestionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(4).optional(),
  recommendation: z.string().min(1),
});

export const grillResponseSchema = z.discriminatedUnion("done", [
  z.object({
    done: z.literal(false),
    questions: z.array(grillQuestionSchema).min(1),
  }),
  z.object({
    done: z.literal(true),
    summary: z.string().min(1),
  }),
]);
