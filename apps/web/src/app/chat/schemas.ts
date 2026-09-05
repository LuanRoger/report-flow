import z from "zod";

export const chatSubmitRequestSchema = z
  .object({
    message: submittedUserMessageSchema,
    pondId: z.number().int().positive(),
  })
  .strict();
