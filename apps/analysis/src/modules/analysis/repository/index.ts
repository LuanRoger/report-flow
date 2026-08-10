import { analysisEmbeddings, analysisResults, db } from "database";
import { and, cosineDistance, desc, eq, gt, sql } from "drizzle-orm";
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
			recordedAt: "desc",
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
			recordedAt: "desc",
		},
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
	});
	if (!result) {
		return;
	}

	return await analysisResultsSchema.parseAsync(result);
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
	limit = 4,
	minSimilarity = 0.5
) {
	const queryEmbedding = await generateEmbedding(query);

	const similarity = sql<number>`1 - (${cosineDistance(
		analysisEmbeddings.embedding,
		queryEmbedding
	)})`;

	const whereClause = analysisId
		? and(
				gt(similarity, minSimilarity),
				eq(analysisEmbeddings.analysisId, analysisId)
			)
		: gt(similarity, minSimilarity);
	const dbQuery = db
		.select({
			analysisId: analysisEmbeddings.analysisId,
			content: analysisEmbeddings.content,
			id: analysisEmbeddings.id,
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
	embeddingData: CreateAnalysisEmbedding
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
	content: string
): Promise<void> {
	const embedding = await generateEmbedding(content);

	await db.insert(analysisEmbeddings).values({
		analysisId,
		content,
		embedding,
	});
}

export async function deleteAnalysisById(analysisId: number) {
	await db.transaction(async (tx) => {
		await tx
			.delete(analysisResults)
			.where(eq(analysisResults.id, analysisId))
			.execute();

		await tx
			.delete(analysisEmbeddings)
			.where(eq(analysisEmbeddings.analysisId, analysisId))
			.execute();
	});
}
