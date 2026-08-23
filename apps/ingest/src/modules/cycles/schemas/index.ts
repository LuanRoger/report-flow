import z from "zod";

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
