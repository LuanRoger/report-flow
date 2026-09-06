import z from "zod";
import {
  liveBuckets,
  liveParameterCodes,
  liveWindows,
} from "@/app/constants/live";
import { unitCodes } from "@/app/constants/measurements";

export const liveMeasurementsInputSchema = z.object({
  bucket: z.enum(liveBuckets).default("1m"),
  pondId: z.number().int().positive(),
  window: z.enum(liveWindows).default("1h"),
});

export const liveMeasurementPointSchema = z.object({
  averageValue: z.number(),
  bucketStart: z.iso.datetime(),
  lastValue: z.number(),
  maximumValue: z.number(),
  minimumValue: z.number(),
  parameterCode: z.enum(liveParameterCodes),
  sampleCount: z.number().int().nonnegative(),
  unit: z.enum(unitCodes),
});

export const liveMeasurementsSnapshotSchema = z.object({
  bucket: z.enum(liveBuckets),
  generatedAt: z.iso.datetime(),
  items: z.array(liveMeasurementPointSchema),
  pondId: z.number(),
  range: z.object({
    endDate: z.iso.datetime(),
    startDate: z.iso.datetime(),
  }),
  window: z.enum(liveWindows),
});
