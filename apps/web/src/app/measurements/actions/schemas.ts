import z from "zod";
import { parameterCodes, unitCodes } from "@/app/constants/measurements";

export const measurementSchema = z.object({
  createdAt: z.iso.datetime(),
  cycleId: z.number(),
  id: z.number(),
  parameterCode: z.enum(parameterCodes),
  pondId: z.number(),
  recordedAt: z.iso.datetime(),
  sourceFile: z.string().nullable(),
  sourceType: z.string(),
  unit: z.enum(unitCodes),
  value: z.number(),
});

export const measurementsPageSchema = z.object({
  items: z.array(measurementSchema),
  pagination: z.object({
    hasNextPage: z.boolean(),
    limit: z.number().int().positive(),
    nextCursor: z.string().nullable(),
  }),
});

export const paginationInputSchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(25),
});

export const measurementsInputSchema = z.discriminatedUnion("scope", [
  paginationInputSchema.extend({
    pondId: z.number().int().positive(),
    scope: z.literal("pond"),
  }),
  paginationInputSchema.extend({
    cycleId: z.number().int().positive(),
    scope: z.literal("cycle"),
  }),
]);
