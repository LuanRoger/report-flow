import { z } from "zod";
import { parameterCodes } from "@/models/params";

export const ingestManualRouteBodySchema = z.object({
	farmId: z.string(),
	pondId: z.string(),
	cycleId: z.string(),
	recordedAt: z.coerce.date(),
	parameterCode: z.enum(parameterCodes),
	value: z.number(),
	unit: z.string().optional(),
	source: z.string(),
});

export type IngestManualRouteBody = z.infer<typeof ingestManualRouteBodySchema>;
