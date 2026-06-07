import {
	analysisEmbeddings,
	analysisResults,
	createInsertSchema,
	createSelectSchema,
	measurements,
} from "database";
import type z from "zod";
import type { Metadata } from "../schemas/types";

const measurementsSchema = createSelectSchema(measurements);
const createAnalysisResult = createInsertSchema(analysisResults);
const createAnalysisEmbedding = createInsertSchema(analysisEmbeddings);

export type AnalysisMetadata = Metadata;
export type Measurement = z.infer<typeof measurementsSchema>;

export type CreateAnalysisResult = z.infer<typeof createAnalysisResult>;
export type CreateAnalysisEmbedding = z.infer<typeof createAnalysisEmbedding>;
