import {
  analysisEmbeddings,
  analysisResults,
  createInsertSchema,
  createSelectSchema,
  measurements,
} from "database";
import z from "zod";
import { metadataSchema } from "../schemas";
import type { Metadata } from "../schemas/types";

export const measurementsSchema = createSelectSchema(measurements);
export const analysisResultsSchema = createSelectSchema(analysisResults, {
  metadata: z.string().transform((value) => {
    const metadata = JSON.parse(value);

    return metadataSchema.parse(metadata);
  }),
});
export const createAnalysisResult = createInsertSchema(analysisResults);
export const createAnalysisEmbedding = createInsertSchema(analysisEmbeddings);

export type AnalysisMetadata = Metadata;
export type Measurement = z.infer<typeof measurementsSchema>;
export type AnalysisResult = z.infer<typeof analysisResultsSchema>;

export type CreateAnalysisResult = z.infer<typeof createAnalysisResult>;
export type CreateAnalysisEmbedding = z.infer<typeof createAnalysisEmbedding>;
