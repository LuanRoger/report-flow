import { z } from "zod";
import { parameterCodes, unitCodes } from "@/db";

export const ingestManualRouteBodySchema = z.object({
	cycleId: z.number(),
	parameterCode: z.enum(parameterCodes),
	pondId: z.number(),
	recordedAt: z.coerce.date(),
	sourceType: z.string(),
	unit: z.enum(unitCodes),
	value: z.number(),
});
