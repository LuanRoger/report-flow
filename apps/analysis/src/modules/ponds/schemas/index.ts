import z from "zod";

export const getPondsResponseSchema = z.array(
  z.object({
    cycle: z.number().nullable(),
    id: z.number(),
  })
);

export const getPondCycleParamsSchema = z.object({
  id: z.coerce.number().positive(),
});

export const getPondCycleResponseSchema = z.object({
  endDate: z.iso.date(),
  harvestDate: z.iso.date().nullable(),
  id: z.number(),
  startDate: z.iso.date(),
});
