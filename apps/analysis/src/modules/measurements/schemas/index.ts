import { parameterCodes, unitCodes } from "database";
import z from "zod";
import {
  REALTIME_BUCKETS,
  REALTIME_MEASUREMENT_PARAMETERS,
  REALTIME_WINDOWS,
} from "../constants";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export const measurementScopeParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const measurementsQuerySchema = z
  .object({
    cursor: z.string().min(1).optional(),
    endDate: z.coerce.date().optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_PAGE_SIZE)
      .default(DEFAULT_PAGE_SIZE),
    startDate: z.coerce.date().optional(),
  })
  .superRefine(({ endDate, startDate }, context) => {
    if (endDate && startDate && endDate < startDate) {
      context.addIssue({
        code: "custom",
        message: "End date must be on or after the start date",
        path: ["endDate"],
      });
    }
  });

export const realtimeMeasurementsQuerySchema = z.object({
  bucket: z.enum(REALTIME_BUCKETS).default("1m"),
  window: z.enum(REALTIME_WINDOWS).default("1h"),
});

export const measurementSchema = z.object({
  createdAt: z.coerce.date(),
  cycleId: z.number(),
  id: z.number(),
  parameterCode: z.enum(parameterCodes),
  pondId: z.number(),
  recordedAt: z.coerce.date(),
  sourceFile: z.string().nullable(),
  sourceType: z.string(),
  unit: z.enum(unitCodes),
  value: z.number(),
});

export const measurementsPageResponseSchema = z.object({
  items: z.array(measurementSchema),
  pagination: z.object({
    hasNextPage: z.boolean(),
    limit: z.number(),
    nextCursor: z.string().nullable(),
  }),
});

export const realtimeMeasurementsResponseSchema = z.object({
  bucket: z.enum(REALTIME_BUCKETS),
  generatedAt: z.coerce.date(),
  items: z.array(
    z.object({
      averageValue: z.number(),
      bucketStart: z.coerce.date(),
      lastValue: z.number(),
      maximumValue: z.number(),
      minimumValue: z.number(),
      parameterCode: z.enum(REALTIME_MEASUREMENT_PARAMETERS),
      sampleCount: z.number().int().nonnegative(),
      unit: z.enum(unitCodes),
    })
  ),
  pondId: z.number(),
  range: z.object({
    endDate: z.coerce.date(),
    startDate: z.coerce.date(),
  }),
  window: z.enum(REALTIME_WINDOWS),
});
