import z from "zod";

export const createPondBodySchema = z.object({
  cycle: z.number().int().optional(),
});
