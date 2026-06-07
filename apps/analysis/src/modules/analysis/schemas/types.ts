import type z from "zod";
import type {
	aggregationWeightsSchema,
	analysisBodySchema,
	dataCoverageSchema,
	errorResponseSchema,
	executionStatsSchema,
	metadataSchema,
	normalizedScoresSchema,
	parameterStatsSchema,
	parametersScores,
	parameterWeightsSchema,
	pondScoreResultSchema,
	rawValuesSchema,
	temporalMetricsSchema,
	timeRangeSchema,
} from ".";

export type AnalysisQuery = z.infer<typeof analysisBodySchema>;
export type ParametersScores = z.infer<typeof parametersScores>;
export type PondScoreResult = z.infer<typeof pondScoreResultSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type AggregationWeights = z.infer<typeof aggregationWeightsSchema>;
export type ParameterWeights = z.infer<typeof parameterWeightsSchema>;
export type DataCoverage = z.infer<typeof dataCoverageSchema>;
export type TimeRange = z.infer<typeof timeRangeSchema>;
export type ExecutionStats = z.infer<typeof executionStatsSchema>;
export type RawValues = z.infer<typeof rawValuesSchema>;
export type NormalizedScores = z.infer<typeof normalizedScoresSchema>;
export type TemporalMetrics = z.infer<typeof temporalMetricsSchema>;
export type ParameterStats = z.infer<typeof parameterStatsSchema>;
export type Metadata = z.infer<typeof metadataSchema>;
