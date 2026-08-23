import { DateTime } from "luxon";
import z from "zod";
import { InvalidDateError } from "../models/errors";

export const cycleDateSchema = z.coerce.date().transform((date) => {
	const transformedDate = DateTime.fromJSDate(date).toISO();
	if (!transformedDate) {
		throw new InvalidDateError();
	}

	return transformedDate;
});

export const createCycleBodySchema = z
	.object({
		endDate: cycleDateSchema.optional(),
		harvestDate: cycleDateSchema.optional(),
		pondId: z.number().int().positive(),
		startDate: cycleDateSchema,
	})
	.superRefine((cycle, context) => {
		const { endDate, harvestDate, startDate } = cycle;

		if (endDate && startDate) {
			const parsedEndDate = DateTime.fromISO(endDate);
			const parsedStartDate = DateTime.fromISO(startDate);
			if (parsedEndDate < parsedStartDate) {
				context.addIssue({
					code: "custom",
					message: "End date must be on or after the start date",
					path: ["endDate"],
				});
			}
		}

		if (harvestDate && startDate) {
			const parsedStartDate = DateTime.fromISO(startDate);
			const parsedHarvestDate = DateTime.fromISO(harvestDate);
			if (parsedHarvestDate < parsedStartDate) {
				context.addIssue({
					code: "custom",
					message: "Harvest date must be on or after the start date",
					path: ["harvestDate"],
				});
			}
		}
	});

export const createCycleResponseSchema = z.object({
	endDate: z.string().nullable(),
	harvestDate: z.string().nullable(),
	id: z.number(),
	pondId: z.number(),
	startDate: z.string(),
});
