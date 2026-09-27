import z from "zod";

export const parameterCodeSchema = z.enum([
  "dissolvedOxygen",
  "temperature",
  "ph",
  "salinity",
]);

const analysisIdentifierSchema = z.object({
  analysisId: z.number().int().positive(),
});

export const getAnalysisByIdInputSchema = analysisIdentifierSchema;

export const getAnalysesByPondInputSchema = z.object({
  pondId: z.number().int().positive(),
});

export const analysisListItemSchema = z.object({
  createdAt: z.iso.datetime(),
  cycleId: z.number().int().positive().nullable(),
  dissolvedOxygenScore: z.number().min(1).max(100),
  endTime: z.iso.datetime(),
  finalScore: z.number().min(1).max(100),
  id: z.number().int().positive(),
  phScore: z.number().min(1).max(100),
  pondId: z.number().int().positive(),
  salinityScore: z.number().min(1).max(100),
  startTime: z.iso.datetime(),
  temperatureScore: z.number().min(1).max(100),
});

const numericStatsSchema = z.object({
  count: z.number().int().nonnegative(),
  max: z.number().nullable(),
  mean: z.number().nullable(),
  min: z.number().nullable(),
});

const parameterCoverageSchema = z.object({
  coveragePercentage: z.number().min(0).max(100),
  coveredDurationSeconds: z.number().nonnegative(),
  missingDurationSeconds: z.number().nonnegative(),
});

const temporalMetricsSchema = parameterCoverageSchema.extend({
  pLow: z.number().min(0).max(1),
  unfavorableDurationSeconds: z.number().nonnegative(),
  unfavorableIntervals: z.array(
    z.object({
      durationSeconds: z.number().positive(),
      end: z.iso.datetime(),
      start: z.iso.datetime(),
    })
  ),
  weightedMeanScore: z.number().min(1).max(100),
});

const parameterStatsSchema = z.object({
  normalizedScores: numericStatsSchema,
  rawValues: numericStatsSchema,
  temporalMetrics: temporalMetricsSchema,
});

const metadataSchema = z.object({
  criticalThreshold: z.number().min(1).max(100),
  executionStats: z.object({
    dataCoverage: z.object({
      coveragePercentage: z.number().min(0).max(100),
      hasSufficientCoverage: z.boolean(),
      minimumRequiredPercentage: z.number().min(0).max(100),
      missingParameters: z.array(parameterCodeSchema),
      parameterCoverage: z.record(parameterCodeSchema, parameterCoverageSchema),
      presentParameters: z.array(parameterCodeSchema),
    }),
    measurementsByParameter: z.record(
      parameterCodeSchema,
      z.number().int().nonnegative()
    ),
    timeRange: z.object({
      actualEnd: z.iso.datetime(),
      actualStart: z.iso.datetime(),
      requestedEnd: z.iso.datetime(),
      requestedStart: z.iso.datetime(),
    }),
    totalMeasurements: z.number().int().nonnegative(),
  }),
  maximumContinuityGapSeconds: z.number().positive(),
  minimumCoveragePercentage: z.number().min(0).max(100),
  parameterStats: z.record(parameterCodeSchema, parameterStatsSchema),
  parameterWeights: z.record(parameterCodeSchema, z.number().nonnegative()),
  scoringModelVersion: z.string().min(1),
  windowConvention: z.literal("[start,end)"),
});

export const analysisDetailsSchema = analysisListItemSchema.extend({
  aiSummary: z.string().nullable(),
  metadata: metadataSchema,
});

export const analysesByPondResponseSchema = z.array(analysisListItemSchema);
export const analysisByIdResponseSchema = analysisDetailsSchema.nullable();
