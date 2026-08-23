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

export const createCycleBodySchema = z
	.object({
		endDate: z.coerce.date().optional(),
		harvestDate: z.coerce.date().optional(),
		pondId: z.number().int().positive(),
		startDate: z.coerce.date(),
	})
	.superRefine((cycle, context) => {
		if (cycle.endDate && cycle.endDate < cycle.startDate) {
			context.addIssue({
				code: "custom",
				message: "End date must be on or after the start date",
				path: ["endDate"],
			});
		}

		if (cycle.harvestDate && cycle.harvestDate < cycle.startDate) {
			context.addIssue({
				code: "custom",
				message: "Harvest date must be on or after the start date",
				path: ["harvestDate"],
			});
		}
	});

export const createCycleResponseSchema = z.object({
	endDate: z.string().nullable(),
	harvestDate: z.string().nullable(),
	id: z.number(),
	pondId: z.number(),
	startDate: z.string(),
});
