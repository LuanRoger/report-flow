import {
  analysisAiSummaries,
  analysisEmbeddings,
  analysisResults,
  db,
} from "database";
import { desc, eq } from "drizzle-orm";
import { generateEmbedding } from "../utils/rag";
import {
  type AnalysisResult,
  analysisResultsSchema,
  type CreateAnalysisEmbedding,
  type CreateAnalysisResult,
  type Measurement,
} from "./types";

export async function getMeasurementsForCycle(
  cycleId: number
): Promise<Measurement[]> {
  return await db.query.measurements.findMany({
    orderBy: {
      recordedAt: "asc",
    },
    where: {
      cycleId,
    },
  });
}

export async function getMeasurementsForPond(
  pondId: number,
  startDate: Date,
  endDate: Date
): Promise<Measurement[]> {
  return await db.query.measurements.findMany({
    orderBy: {
      recordedAt: "asc",
    },
    where: {
      AND: [
        {
          pondId,
        },
        {
          recordedAt: {
            gte: startDate,
            lt: endDate,
          },
        },
      ],
    },
  });
}

export async function getPondById(id: number) {
  return await db.query.ponds.findFirst({
    where: {
      id,
    },
  });
}

export async function getAnalysisById(
  id: number
): Promise<AnalysisResult | undefined> {
  const result = await db.query.analysisResults.findFirst({
    where: {
      id,
    },
    with: {
      aiSummary: true,
    },
  });
  if (!result) {
    return;
  }

  const analysis = await analysisResultsSchema.parseAsync(result);
  return {
    ...analysis,
    aiSummary: result.aiSummary?.summary ?? null,
  };
}

export async function getAnalysesForPond(pondId: number) {
  return await db
    .select()
    .from(analysisResults)
    .where(eq(analysisResults.pondId, pondId))
    .orderBy(desc(analysisResults.createdAt))
    .execute();
}

export async function storeAnalysisResult(
  result: CreateAnalysisResult,
  embeddingData: CreateAnalysisEmbedding,
  aiSummary: string | null
): Promise<void> {
  await db.transaction(async (transaction) => {
    const [newAnalysis] = await transaction
      .insert(analysisResults)
      .values(result)
      .returning({ id: analysisResults.id });
    if (!newAnalysis) {
      throw new Error("Failed to create analysis result");
    }

    await transaction.insert(analysisEmbeddings).values({
      analysisId: newAnalysis.id,
      ...embeddingData,
    });

    if (aiSummary) {
      await transaction.insert(analysisAiSummaries).values({
        analysisId: newAnalysis.id,
        summary: aiSummary,
      });
    }
  });
}

export async function createAnalysisResult(
  data: CreateAnalysisResult
): Promise<void> {
  await db.insert(analysisResults).values(data);
}

export async function storeAnalysisEmbedding(
  analysisId: number,
  content: string
): Promise<void> {
  const embedding = await generateEmbedding(content);

  await db.insert(analysisEmbeddings).values({
    analysisId,
    content,
    embedding,
  });
}

export async function deleteAnalysisById(analysisId: number): Promise<void> {
  await db
    .delete(analysisResults)
    .where(eq(analysisResults.id, analysisId))
    .execute();
}
