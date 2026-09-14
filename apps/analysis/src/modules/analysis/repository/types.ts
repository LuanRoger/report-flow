import {
  analysisAiSummaries,
  analysisEmbeddings,
  analysisResults,
  createInsertSchema,
  createSelectSchema,
  measurements,
} from "database";
import z from "zod";
import { metadataSchema } from "../schemas";
import type { Metadata } from "../schemas/types";

function parseMetadata(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export const measurementsSchema = createSelectSchema(measurements);
export const analysisResultsSchema = createSelectSchema(analysisResults, {
  metadata: z.preprocess(parseMetadata, metadataSchema),
});
export const createAnalysisResultSchema = createInsertSchema(analysisResults);
export const createAnalysisEmbeddingSchema =
  createInsertSchema(analysisEmbeddings);
export const createAnalysisAiSummarySchema =
  createInsertSchema(analysisAiSummaries);

export type AnalysisMetadata = Metadata;
export type Measurement = z.infer<typeof measurementsSchema>;
export type AnalysisResult = z.infer<typeof analysisResultsSchema> & {
  aiSummary: string | null;
};

export type CreateAnalysisResult = z.infer<typeof createAnalysisResultSchema>;
export type CreateAnalysisEmbedding = Omit<
  z.infer<typeof createAnalysisEmbeddingSchema>,
  "analysisId"
>;
export type CreateAnalysisAiSummary = z.infer<
  typeof createAnalysisAiSummarySchema
>;
