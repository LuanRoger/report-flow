import type z from "zod";
import type { createCycleBodySchema, ingestManualRouteBodySchema } from ".";

export type CreateCycle = z.infer<typeof createCycleBodySchema>;
export type IngestManualRouteBody = z.infer<typeof ingestManualRouteBodySchema>;
