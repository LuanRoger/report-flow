import { z } from "zod";
import { parameterCodes } from "@/db";

export const ingestManualRouteBodySchema = z.object({
	farmId: z.string(),
	pondId: z.string(),
	cycleId: z.string(),
	recordedAt: z.coerce.date(),
	parameterCode: z.enum(parameterCodes),
	value: z.string(),
	unit: z.string().optional(),
	source: z.string(),
});
