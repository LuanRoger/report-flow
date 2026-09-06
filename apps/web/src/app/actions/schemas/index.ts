import z from "zod";

export const getPondsResponseSchema = z.array(
  z.object({
    cycle: z.number().nullable(),
    id: z.number(),
  })
);

export const getPondCyclesInputSchema = z.object({
  id: z.number(),
});

export const getPondCyclesResponseSchema = z.array(
  z.object({
    endDate: z.iso.date(),
    harvestDate: z.iso.date().nullable(),
    id: z.number(),
    startDate: z.iso.date(),
  })
);
