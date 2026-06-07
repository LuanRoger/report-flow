import { analysisEmbeddings, analysisResults, db } from "database";
import { and, cosineDistance, desc, eq, gt, sql } from "drizzle-orm";
import { generateEmbedding } from "../utils/rag";
import type {
	CreateAnalysisEmbedding,
	CreateAnalysisResult,
	Measurements,
} from "./types";

export async function getMeasurementsForCycle(
	cycleId: number,
): Promise<Measurements[]> {
	return await db.query.measurements.findMany({
		where: {
			cycleId,
		},
		orderBy: {
			recordedAt: "desc",
		},
	});
}

export async function getMeasurementsForPond(
	pondId: number,
	startDate: Date,
	endDate: Date,
): Promise<Measurements[]> {
	return db.query.measurements.findMany({
		where: {
			AND: [
				{
					pondId,
				},
				{
					recordedAt: {
						gte: startDate,
						lte: endDate,
					},
				},
			],
		},
		orderBy: {
			recordedAt: "desc",
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

export async function getAnalysisById(id: number) {
	return await db.query.analysisResults.findFirst({
		where: {
			id,
		},
	});
}

export async function getAnalysesForPond(pondId: number) {
	return await db
		.select()
		.from(analysisResults)
		.where(eq(analysisResults.pondId, pondId))
		.orderBy(desc(analysisResults.createdAt))
		.execute();
}

export async function findRelevantAnalyses(
	query: string,
	analysisId?: number,
	limit: number = 4,
	minSimilarity: number = 0.5,
) {
	const queryEmbedding = await generateEmbedding(query);

	const similarity = sql<number>`1 - (${cosineDistance(
		analysisEmbeddings.embedding,
		queryEmbedding,
	)})`;

	const whereClause = analysisId
		? and(
				gt(similarity, minSimilarity),
				eq(analysisEmbeddings.analysisId, analysisId),
			)
		: gt(similarity, minSimilarity);
	const dbQuery = db
		.select({
			id: analysisEmbeddings.id,
			analysisId: analysisEmbeddings.analysisId,
			content: analysisEmbeddings.content,
			similarity,
		})
		.from(analysisEmbeddings)
		.where(whereClause)
		.orderBy(desc(similarity))
		.limit(limit);

	const results = await dbQuery.execute();
	return results;
}

export async function storeAnalysisResult(
	result: CreateAnalysisResult,
	embeddingData: CreateAnalysisEmbedding,
) {
	await db.transaction(async (tx) => {
		const newAnalysis = await tx
			.insert(analysisResults)
			.values(result)
			.returning();
		if (newAnalysis.length === 0) {
			throw new Error("Failed to create analysis result");
		}

		const analysisId = newAnalysis[0].id;
		await tx.insert(analysisEmbeddings).values({
			analysisId,
			...embeddingData,
		});
	});
}

export async function createAnalysisResult(data: CreateAnalysisResult) {
	await db.insert(analysisResults).values(data);
}

export async function storeAnalysisEmbedding(
	analysisId: number,
	content: string,
): Promise<void> {
	const embedding = await generateEmbedding(content);

	await db.insert(analysisEmbeddings).values({
		analysisId,
		content,
		embedding,
	});
}

export async function deleteAnalysisById(analysisId: number) {
	await db
		.delete(analysisResults)
		.where(eq(analysisResults.id, analysisId))
		.execute();
}
