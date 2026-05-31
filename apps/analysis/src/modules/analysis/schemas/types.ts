import type z from "zod";
import type {
	analysisQuerySchema,
	errorResponseSchema,
	pondScoreResultSchema,
} from ".";

export type AnalysisQuery = z.infer<typeof analysisQuerySchema>;
export type PondScoreResult = z.infer<typeof pondScoreResultSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
