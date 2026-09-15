import type z from "zod";
import type {
  analysisBodySchema,
  analysisExecutionResponseSchema,
  analysisGenerationOptionsSchema,
  dataCoverageSchema,
  executionPhaseFlagsSchema,
  executionStatsSchema,
  executionTimingsSchema,
  metadataSchema,
  normalizedScoresSchema,
  parameterCoverageSchema,
  parameterStatsSchema,
  parametersScores,
  parameterWeightsSchema,
  rawValuesSchema,
  scoreResultSchema,
  temporalMetricsSchema,
  timeRangeSchema,
  unfavorableIntervalSchema,
} from ".";

export type AnalysisQuery = z.infer<typeof analysisBodySchema>;
export type AnalysisGenerationOptions = z.infer<
  typeof analysisGenerationOptionsSchema
>;
export type AnalysisGenerationOptionsInput = z.input<
  typeof analysisGenerationOptionsSchema
>;
export type ParametersScores = z.infer<typeof parametersScores>;
export type ScoreResult = z.infer<typeof scoreResultSchema>;
export type AnalysisExecutionResponse = z.infer<
  typeof analysisExecutionResponseSchema
>;
export type ExecutionPhaseFlags = z.infer<typeof executionPhaseFlagsSchema>;
export type ExecutionTimings = z.infer<typeof executionTimingsSchema>;
export type ParameterWeights = z.infer<typeof parameterWeightsSchema>;
export type ParameterCoverage = z.infer<typeof parameterCoverageSchema>;
export type DataCoverage = z.infer<typeof dataCoverageSchema>;
export type TimeRange = z.infer<typeof timeRangeSchema>;
export type ExecutionStats = z.infer<typeof executionStatsSchema>;
export type RawValues = z.infer<typeof rawValuesSchema>;
export type NormalizedScores = z.infer<typeof normalizedScoresSchema>;
export type UnfavorableInterval = z.infer<typeof unfavorableIntervalSchema>;
export type TemporalMetrics = z.infer<typeof temporalMetricsSchema>;
export type ParameterStats = z.infer<typeof parameterStatsSchema>;
export type Metadata = z.infer<typeof metadataSchema>;
