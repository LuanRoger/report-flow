import { z } from "zod";
import { ANALYSIS_TIME_WINDOWS } from "../constants";

export const idParamSchema = z.object({
  id: z.coerce.number().min(1, { error: "ID is required" }),
});

export const analysisBodySchema = z.object({
  endDate: z.coerce.date().optional(),
  startDate: z.coerce.date().optional(),
  window: z.enum(ANALYSIS_TIME_WINDOWS).optional().default("7d"),
});

export const parametersScores = z.object({
  dissolvedOxygen: z.number().min(1).max(100),
  ph: z.number().min(1).max(100),
  salinity: z.number().min(1).max(100),
  temperature: z.number().min(1).max(100),
  turbidity: z.number().min(1).max(100),
});

export const aggregationWeightsSchema = z.object({
  alpha: z.number(),
  beta: z.number(),
  gamma: z.number(),
});

export const parameterWeightsSchema = z.object({
  dissolvedOxygen: z.number(),
  ph: z.number(),
  salinity: z.number(),
  temperature: z.number(),
  turbidity: z.number(),
});

export const dataCoverageSchema = z.object({
  coveragePercentage: z.number().min(0).max(100),
  hasSufficientCoverage: z.boolean(),
  presentParameters: z.array(z.string()),
});

export const timeRangeSchema = z.object({
  actualEnd: z.coerce.date(),
  actualStart: z.coerce.date(),
  requestedEnd: z.coerce.date(),
  requestedStart: z.coerce.date(),
});

export const executionStatsSchema = z.object({
  dataCoverage: dataCoverageSchema,
  measurementsByParameter: z.record(z.string(), z.number()),
  timeRange: timeRangeSchema,
  totalMeasurements: z.number(),
});

export const rawValuesSchema = z.object({
  count: z.number(),
  max: z.number().nullable(),
  mean: z.number().nullable(),
  min: z.number().nullable(),
});

export const normalizedScoresSchema = z.object({
  count: z.number(),
  max: z.number().nullable(),
  mean: z.number().nullable(),
  min: z.number().nullable(),
});

export const temporalMetricsSchema = z.object({
  criticalCount: z.number(),
  criticalTimeRatio: z.number(),
  meanScore: z.number(),
  minScore: z.number(),
});

export const parameterStatsSchema = z.object({
  normalizedScores: normalizedScoresSchema,
  rawValues: rawValuesSchema,
  temporalMetrics: temporalMetricsSchema,
});

export const metadataSchema = z.object({
  aggregationWeights: aggregationWeightsSchema,
  criticalThreshold: z.number(),
  executionStats: executionStatsSchema,
  parameterStats: z.record(z.string(), parameterStatsSchema),
  parameterWeights: parameterWeightsSchema,
});

export const scoreResultSchema = z.object({
  aiSummary: z.string().optional(),
  endDate: z.coerce.date(),
  finalScore: z.number().min(1).max(100),
  metadata: metadataSchema,
  parameterScores: parametersScores,
  pondId: z.number(),
  startDate: z.coerce.date(),
});

export const getAnalysisById200ResponseSchema = z.object({
  aiSummary: z.string().optional(),
  createdAt: z.coerce.date(),
  cycleId: z.number(),
  dissolvedOxygenScore: z.number().min(0).max(100),
  endTime: z.coerce.date(),
  finalScore: z.number().min(0).max(100),
  id: z.number(),
  metadata: metadataSchema,
  phScore: z.number().min(0).max(100),
  pondId: z.number(),
  salinityScore: z.number().min(0).max(100),
  startTime: z.coerce.date(),
  temperatureScore: z.number().min(0).max(100),
  turbidityScore: z.number().min(0).max(100),
});

export const performAnalysisByPond200ResponseSchema = scoreResultSchema;
export const performAnalysisByCycle200ResponseSchema = scoreResultSchema;
