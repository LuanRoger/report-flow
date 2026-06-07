import type z from "zod";
import type { Metadata } from "../schemas/types";
import {
	analysisResults,
	analysisEmbeddings,
	createInsertSchema,
	createSelectSchema,
	measurements,
} from "database";

const measurementsSchema = createSelectSchema(measurements);
const createAnalysisResult = createInsertSchema(analysisResults);
const createAnalysisEmbedding = createInsertSchema(analysisEmbeddings);

export type AnalysisMetadata = Metadata;
export type Measurements = z.infer<typeof measurementsSchema>;

export type CreateAnalysisResult = z.infer<typeof createAnalysisResult>;
export type CreateAnalysisEmbedding = z.infer<typeof createAnalysisEmbedding>;
