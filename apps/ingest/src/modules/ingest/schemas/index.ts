import { z } from "zod";
import { parameterCodes, unitCodes } from "@/db";

export const ingestManualRouteBodySchema = z.object({
	pondId: z.number(),
	cycleId: z.number(),
	recordedAt: z.coerce.date(),
	parameterCode: z.enum(parameterCodes),
	value: z.number(),
	unit: z.enum(unitCodes),
	sourceType: z.string(),
});
