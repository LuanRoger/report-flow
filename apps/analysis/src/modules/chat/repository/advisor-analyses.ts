import { analysisEmbeddings, analysisResults, db } from "database";
import { and, cosineDistance, desc, eq, gt, sql } from "drizzle-orm";
import { metadataSchema } from "../../analysis/schemas";
import type { Metadata } from "../../analysis/schemas/types";

export interface AdvisorAnalysis {
  analysisCreatedAt: Date;
  analysisId: number;
  cycleId: number | null;
  dissolvedOxygenScore: number;
  endTime: Date;
  finalScore: number;
  metadata: Metadata | undefined;
  phScore: number;
  salinityScore: number;
  startTime: Date;
  temperatureScore: number;
  turbidityScore: number;
}

const advisorAnalysisSelection = {
  analysisCreatedAt: analysisResults.createdAt,
  analysisId: analysisResults.id,
  cycleId: analysisResults.cycleId,
  dissolvedOxygenScore: analysisResults.dissolvedOxygenScore,
  endTime: analysisResults.endTime,
  finalScore: analysisResults.finalScore,
  metadata: analysisResults.metadata,
  phScore: analysisResults.phScore,
  salinityScore: analysisResults.salinityScore,
  startTime: analysisResults.startTime,
  temperatureScore: analysisResults.temperatureScore,
  turbidityScore: analysisResults.turbidityScore,
};

function parseAnalysisMetadata(metadata: unknown): Metadata | undefined {
  let parsedMetadata = metadata;

  if (typeof metadata === "string") {
    try {
      parsedMetadata = JSON.parse(metadata);
    } catch {
      return;
    }
  }

  const result = metadataSchema.safeParse(parsedMetadata);
  return result.success ? result.data : undefined;
}

function normalizeAdvisorAnalysis<T extends { metadata: unknown }>(
  analysis: T
): Omit<T, "metadata"> & { metadata: Metadata | undefined } {
  return {
    ...analysis,
    metadata: parseAnalysisMetadata(analysis.metadata),
  };
}

export async function findRecentAnalysesForPond(
  pondId: number,
  limit: number
): Promise<AdvisorAnalysis[]> {
  const analyses = await db
    .select(advisorAnalysisSelection)
    .from(analysisResults)
    .where(eq(analysisResults.pondId, pondId))
    .orderBy(desc(analysisResults.createdAt), desc(analysisResults.id))
    .limit(limit);

  return analyses.map(normalizeAdvisorAnalysis);
}

export async function findSemanticallyRelevantAnalysesForPond(
  pondId: number,
  queryEmbedding: number[],
  limit: number,
  minimumSimilarity: number
): Promise<Array<AdvisorAnalysis & { similarity: number }>> {
  const similarity = sql<number>`1 - (${cosineDistance(
    analysisEmbeddings.embedding,
    queryEmbedding
  )})`.mapWith(Number);

  const analyses = await db
    .select({
      ...advisorAnalysisSelection,
      similarity,
    })
    .from(analysisEmbeddings)
    .innerJoin(
      analysisResults,
      eq(analysisEmbeddings.analysisId, analysisResults.id)
    )
    .where(
      and(eq(analysisResults.pondId, pondId), gt(similarity, minimumSimilarity))
    )
    .orderBy(
      desc(similarity),
      desc(analysisResults.createdAt),
      desc(analysisResults.id)
    )
    .limit(limit);

  return analyses.map(normalizeAdvisorAnalysis);
}
