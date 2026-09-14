import { z } from "zod";
import { ANALYSIS_TIME_WINDOWS } from "../constants";

export const idParamSchema = z.object({
  id: z.coerce.number().min(1, { error: "ID is required" }),
});

export const analysisGenerationOptionsSchema = z.object({
  generateAiSummary: z.boolean().optional().default(true),
});

export const analysisBodySchema = analysisGenerationOptionsSchema
  .extend({
    endDate: z.coerce.date().optional(),
    startDate: z.coerce.date().optional(),
    window: z.enum(ANALYSIS_TIME_WINDOWS).optional().default("7d"),
  })
  .superRefine(({ endDate, startDate, window }, context) => {
    if (window === "custom" && !(startDate && endDate)) {
      context.addIssue({
        code: "custom",
        message: "Custom windows require startDate and endDate",
        path: ["window"],
      });
    }

    if (startDate && endDate && startDate.getTime() >= endDate.getTime()) {
      context.addIssue({
        code: "custom",
        message: "startDate must be before endDate",
        path: ["startDate"],
      });
    }
  });

export const parameterCodeSchema = z.enum([
  "dissolvedOxygen",
  "temperature",
  "ph",
  "salinity",
]);

export const parametersScores = z.object({
  dissolvedOxygen: z.number().min(1).max(100),
  ph: z.number().min(1).max(100),
  salinity: z.number().min(1).max(100),
  temperature: z.number().min(1).max(100),
});

export const parameterWeightsSchema = z.object({
  dissolvedOxygen: z.number().nonnegative(),
  ph: z.number().nonnegative(),
  salinity: z.number().nonnegative(),
  temperature: z.number().nonnegative(),
});

export const parameterCoverageSchema = z.object({
  coveragePercentage: z.number().min(0).max(100),
  coveredDurationSeconds: z.number().nonnegative(),
  missingDurationSeconds: z.number().nonnegative(),
});

export const dataCoverageSchema = z.object({
  coveragePercentage: z.number().min(0).max(100),
  hasSufficientCoverage: z.boolean(),
  minimumRequiredPercentage: z.number().min(0).max(100),
  missingParameters: z.array(parameterCodeSchema),
  parameterCoverage: z.record(parameterCodeSchema, parameterCoverageSchema),
  presentParameters: z.array(parameterCodeSchema),
});

export const timeRangeSchema = z.object({
  actualEnd: z.coerce.date(),
  actualStart: z.coerce.date(),
  requestedEnd: z.coerce.date(),
  requestedStart: z.coerce.date(),
});

export const executionStatsSchema = z.object({
  dataCoverage: dataCoverageSchema,
  measurementsByParameter: z.record(parameterCodeSchema, z.number().int()),
  timeRange: timeRangeSchema,
  totalMeasurements: z.number().int().nonnegative(),
});

export const rawValuesSchema = z.object({
  count: z.number().int().nonnegative(),
  max: z.number().nullable(),
  mean: z.number().nullable(),
  min: z.number().nullable(),
});

export const normalizedScoresSchema = rawValuesSchema;

export const unfavorableIntervalSchema = z.object({
  durationSeconds: z.number().positive(),
  end: z.coerce.date(),
  start: z.coerce.date(),
});

export const temporalMetricsSchema = z.object({
  coveragePercentage: z.number().min(0).max(100),
  coveredDurationSeconds: z.number().positive(),
  missingDurationSeconds: z.number().nonnegative(),
  pLow: z.number().min(0).max(1),
  unfavorableDurationSeconds: z.number().nonnegative(),
  unfavorableIntervals: z.array(unfavorableIntervalSchema),
  weightedMeanScore: z.number().min(1).max(100),
});

export const parameterStatsSchema = z.object({
  normalizedScores: normalizedScoresSchema,
  rawValues: rawValuesSchema,
  temporalMetrics: temporalMetricsSchema,
});

export const metadataSchema = z.object({
  criticalThreshold: z.number().min(1).max(100),
  executionStats: executionStatsSchema,
  maximumContinuityGapSeconds: z.number().positive(),
  minimumCoveragePercentage: z.number().min(0).max(100),
  parameterStats: z.record(parameterCodeSchema, parameterStatsSchema),
  parameterWeights: parameterWeightsSchema,
  scoringModelVersion: z.string().min(1),
  windowConvention: z.literal("[start,end)"),
});

export const scoreResultSchema = z.object({
  aiSummary: z.string().nullable(),
  endDate: z.coerce.date(),
  finalScore: z.number().min(1).max(100),
  metadata: metadataSchema,
  parameterScores: parametersScores,
  pondId: z.number(),
  startDate: z.coerce.date(),
});

export const getAnalysisById200ResponseSchema = z.object({
  aiSummary: z.string().nullable(),
  createdAt: z.coerce.date(),
  cycleId: z.number().nullable(),
  dissolvedOxygenScore: z.number().min(1).max(100),
  endTime: z.coerce.date(),
  finalScore: z.number().min(1).max(100),
  id: z.number(),
  metadata: metadataSchema,
  phScore: z.number().min(1).max(100),
  pondId: z.number(),
  salinityScore: z.number().min(1).max(100),
  startTime: z.coerce.date(),
  temperatureScore: z.number().min(1).max(100),
});

export const performAnalysisByPond200ResponseSchema = scoreResultSchema;
export const performAnalysisByCycle200ResponseSchema = scoreResultSchema;
