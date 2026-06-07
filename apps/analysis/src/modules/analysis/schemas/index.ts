import { z } from "zod";
import { ANALYSIS_TIME_WINDOWS } from "../constants";

export const idParamSchema = z.object({
	id: z.coerce.number().min(1, { error: "ID is required" }),
});

export const analysisBodySchema = z.object({
	startDate: z.coerce.date().optional(),
	endDate: z.coerce.date().optional(),
	window: z.enum(ANALYSIS_TIME_WINDOWS).optional().default("7d"),
});

export const parametersScores = z.object({
	temperature: z.number().min(1).max(100),
	ph: z.number().min(1).max(100),
	salinity: z.number().min(1).max(100),
	dissolvedOxygen: z.number().min(1).max(100),
	turbidity: z.number().min(1).max(100),
});

export const aggregationWeightsSchema = z.object({
	alpha: z.number(),
	beta: z.number(),
	gamma: z.number(),
});

export const parameterWeightsSchema = z.object({
	temperature: z.number(),
	ph: z.number(),
	salinity: z.number(),
	dissolvedOxygen: z.number(),
	turbidity: z.number(),
});

export const dataCoverageSchema = z.object({
	presentParameters: z.array(z.string()),
	coveragePercentage: z.number().min(0).max(100),
	hasSufficientCoverage: z.boolean(),
});

export const timeRangeSchema = z.object({
	requestedStart: z.coerce.date(),
	requestedEnd: z.coerce.date(),
	actualStart: z.coerce.date().nullable(),
	actualEnd: z.coerce.date().nullable(),
});

export const executionStatsSchema = z.object({
	totalMeasurements: z.number(),
	measurementsByParameter: z.record(z.string(), z.number()),
	dataCoverage: dataCoverageSchema,
	timeRange: timeRangeSchema,
});

export const rawValuesSchema = z.object({
	min: z.number().nullable(),
	max: z.number().nullable(),
	mean: z.number().nullable(),
	count: z.number(),
});

export const normalizedScoresSchema = z.object({
	min: z.number().nullable(),
	max: z.number().nullable(),
	mean: z.number().nullable(),
	count: z.number(),
});

export const temporalMetricsSchema = z.object({
	meanScore: z.number(),
	minScore: z.number(),
	criticalTimeRatio: z.number(),
	criticalCount: z.number(),
});

export const parameterStatsSchema = z.object({
	rawValues: rawValuesSchema,
	normalizedScores: normalizedScoresSchema,
	temporalMetrics: temporalMetricsSchema,
});

export const metadataSchema = z.object({
	criticalThreshold: z.number(),
	aggregationWeights: aggregationWeightsSchema,
	parameterWeights: parameterWeightsSchema,
	executionStats: executionStatsSchema,
	parameterStats: z.record(z.string(), parameterStatsSchema),
});

export const pondScoreResultSchema = z.object({
	pondId: z.number(),
	startDate: z.coerce.date(),
	endDate: z.coerce.date(),
	finalScore: z.number().min(1).max(100),
	parameterScores: parametersScores,
	metadata: metadataSchema,
});

export const pondScoreResponseSchema = z.object({
	success: z.boolean(),
	data: pondScoreResultSchema,
});

export const errorResponseSchema = z.object({
	error: z.string(),
	message: z.string().optional(),
	details: z.any().optional(),
});
