import type z from "zod";
import type { createCycleBodySchema } from ".";

export type CreateCycle = z.infer<typeof createCycleBodySchema>;
