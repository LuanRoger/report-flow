import { z } from "zod";

// Query parameters for the analysis endpoint
export const analysisQuerySchema = z.object({
	pondId: z.string().min(1, "pondId is required"),
	startDate: z.coerce.date().optional(),
	endDate: z.coerce.date().optional(),
	// Optional: allow predefined time windows
	window: z.enum(["7d", "30d", "90d", "custom"]).optional().default("7d"),
});

export type AnalysisQuery = z.infer<typeof analysisQuerySchema>;

// Response schema with enhanced metadata
export const pondScoreResultSchema = z.object({
	pondId: z.string(),
	startDate: z.date(),
	endDate: z.date(),
	finalScore: z.number().min(1).max(100),
	parameterScores: z.object({
		temperature: z.number().min(1).max(100),
		ph: z.number().min(1).max(100),
		salinity: z.number().min(1).max(100),
		dissolvedOxygen: z.number().min(1).max(100),
		turbidity: z.number().min(1).max(100),
	}),
	metadata: z.object({
		criticalThreshold: z.number(),
		aggregationWeights: z.object({
			alpha: z.number(),
			beta: z.number(),
			gamma: z.number(),
		}),
		parameterWeights: z.object({
			temperature: z.number(),
			ph: z.number(),
			salinity: z.number(),
			dissolvedOxygen: z.number(),
			turbidity: z.number(),
		}),
		// Enhanced debugging information
		executionStats: z.object({
			totalMeasurements: z.number(),
			measurementsByParameter: z.record(z.string(), z.number()),
			dataCoverage: z.object({
				requiredParameters: z.array(z.string()),
				presentParameters: z.array(z.string()),
				coveragePercentage: z.number().min(0).max(100),
				hasSufficientCoverage: z.boolean(),
			}),
			timeRange: z.object({
				requestedStart: z.date(),
				requestedEnd: z.date(),
				actualStart: z.date().nullable(),
				actualEnd: z.date().nullable(),
			}),
		}),
		parameterStats: z.record(
			z.string(),
			z.object({
				rawValues: z.object({
					min: z.number().nullable(),
					max: z.number().nullable(),
					mean: z.number().nullable(),
					count: z.number(),
				}),
				normalizedScores: z.object({
					min: z.number().nullable(),
					max: z.number().nullable(),
					mean: z.number().nullable(),
					count: z.number(),
				}),
				temporalMetrics: z.object({
					meanScore: z.number(),
					minScore: z.number(),
					criticalTimeRatio: z.number(),
					criticalCount: z.number(),
				}),
			}),
		),
	}),
});

export type PondScoreResult = z.infer<typeof pondScoreResultSchema>;

// Error response schema
export const errorResponseSchema = z.object({
	error: z.string(),
	message: z.string().optional(),
	details: z.any().optional(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
