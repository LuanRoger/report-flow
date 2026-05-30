import type z from "zod";
import type { ingestManualRouteBodySchema } from ".";

export type IngestManualRouteBody = z.infer<typeof ingestManualRouteBodySchema>;
