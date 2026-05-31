import { mistral } from "@ai-sdk/mistral";
import { embed, embedMany, generateText } from "ai";
import { analysisEmbeddings, db } from "database";
import { and, cosineDistance, desc, eq, gt, sql } from "drizzle-orm";
import { formatDate } from "@/utils/date";
import { RAG_SYSTEM_PROMPT } from "../constants";
import type { PondScoreResult } from "../schemas/types";

// Mistral embedding model - outputs 1024-dimensional vectors
const EMBEDDING_MODEL = mistral.embeddingModel("mistral-embed");

// Mistral chat model for conversational RAG
const CHAT_MODEL = mistral("ministral-3b-latest");

/**
 * Format analysis result into embeddable content
 * Uses structured analysis data without raw database values to prevent hallucination
 */
function formatAnalysisForEmbedding(result: PondScoreResult): string {
	const { pondId, startDate, endDate, finalScore, parameterScores, metadata } =
		result;
	const { executionStats, parameterStats, criticalThreshold } = metadata;
	const { dataCoverage, timeRange, totalMeasurements } = executionStats;

	// Build parameter descriptions
	const parameterDescriptions = [];
	const parameterCodes = Object.keys(parameterScores) as Array<
		keyof typeof parameterScores
	>;

	for (const paramCode of parameterCodes) {
		const score = parameterScores[paramCode];
		const stats = parameterStats[paramCode];
		const temporal = stats.temporalMetrics;

		const scoreLabel = getScoreLabel(score);

		parameterDescriptions.push(
			`${paramCode}: score=${score.toFixed(0)}/${scoreLabel}, ` +
				`mean=${stats.rawValues.mean?.toFixed(2) ?? "N/A"}, ` +
				`min=${stats.rawValues.min?.toFixed(2) ?? "N/A"}, ` +
				`max=${stats.rawValues.max?.toFixed(2) ?? "N/A"}, ` +
				`count=${stats.rawValues.count}, ` +
				`critical=${(temporal.criticalTimeRatio * 100).toFixed(1)}%`,
		);
	}

	return `
Pond Analysis: ${pondId}
Period: ${formatDate(timeRange.requestedStart)} to ${formatDate(timeRange.requestedEnd)}
Actual Data: ${formatDate(timeRange.actualStart)} to ${formatDate(timeRange.actualEnd)}

Overall Score: ${finalScore.toFixed(1)}/${getScoreLabel(finalScore)}
Total Measurements: ${totalMeasurements}
Data Coverage: ${dataCoverage.coveragePercentage}% (${dataCoverage.presentParameters.length} parameters)
Critical Threshold: ${criticalThreshold}

Parameters:
${parameterDescriptions.join("\n")}

Configuration:
Aggregation Weights: Alpha=${metadata.aggregationWeights.alpha}, Beta=${metadata.aggregationWeights.beta}, Gamma=${metadata.aggregationWeights.gamma}
Parameter Weights: Temperature=${metadata.parameterWeights.temperature}, pH=${metadata.parameterWeights.ph}, Salinity=${metadata.parameterWeights.salinity}, Dissolved Oxygen=${metadata.parameterWeights.dissolvedOxygen}, Turbidity=${metadata.parameterWeights.turbidity}
`;
}

/**
 * Get a label for a score
 */
function getScoreLabel(score: number): string {
	if (score >= 90) return "Excellent";
	if (score >= 80) return "Very Good";
	if (score >= 70) return "Good";
	if (score >= 60) return "Fair";
	if (score >= 40) return "Poor";
	if (score >= 20) return "Very Poor";
	return "Critical";
}

/**
 * Generate embedding for a single text using Mistral's embedding model
 */
export async function generateEmbedding(text: string): Promise<number[]> {
	const { embedding } = await embed({
		model: EMBEDDING_MODEL,
		value: text,
	});
	return embedding;
}

/**
 * Generate embeddings for multiple texts
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
	const { embeddings } = await embedMany({
		model: EMBEDDING_MODEL,
		values: texts,
	});
	return embeddings;
}

/**
 * Store analysis result embedding in the database
 */
export async function storeAnalysisEmbedding(
	pondId: string,
	result: PondScoreResult,
): Promise<void> {
	try {
		const content = formatAnalysisForEmbedding(result);
		const embedding = await generateEmbedding(content);

		// Create a unique analysis ID based on pond and timestamp
		const analysisId = `${pondId}_${Date.now()}`;

		// Store metadata as JSON string
		const metadata = JSON.stringify({
			pondId,
			finalScore: result.finalScore,
			parameterScores: result.parameterScores,
			analysisTimestamp: new Date().toISOString(),
			dataCoverage: result.metadata.executionStats.dataCoverage,
		});

		await db.insert(analysisEmbeddings).values({
			pondId,
			analysisId,
			content,
			metadata,
			embedding,
		});
	} catch (error) {
		console.error("Error storing analysis embedding:", error);
		throw error;
	}
}

/**
 * Find relevant analysis embeddings for a user query
 * Returns the top-k most similar analysis results
 */
export async function findRelevantAnalyses(
	query: string,
	pondId?: string,
	limit: number = 4,
	minSimilarity: number = 0.5,
): Promise<
	Array<{
		id: number;
		pondId: string;
		analysisId: string;
		content: string;
		metadata: string;
		similarity: number;
	}>
> {
	try {
		// Generate embedding for the query
		const queryEmbedding = await generateEmbedding(query);

		// Calculate cosine similarity: 1 - cosine_distance
		// Higher similarity means more relevant
		const similarity = sql<number>`1 - (${cosineDistance(
			analysisEmbeddings.embedding,
			queryEmbedding,
		)})`;

		const whereClause = pondId
			? and(
					gt(similarity, minSimilarity),
					eq(analysisEmbeddings.pondId, pondId),
				)
			: gt(similarity, minSimilarity);
		const dbQuery = db
			.select({
				id: analysisEmbeddings.id,
				pondId: analysisEmbeddings.pondId,
				analysisId: analysisEmbeddings.analysisId,
				content: analysisEmbeddings.content,
				metadata: analysisEmbeddings.metadata,
				similarity,
			})
			.from(analysisEmbeddings)
			.where(whereClause)
			.orderBy(desc(similarity))
			.limit(limit);

		const results = await dbQuery.execute();
		return results;
	} catch (error) {
		console.error("Error finding relevant analyses:", error);
		return [];
	}
}

/**
 * Generate a conversational response using RAG
 * Retrieves relevant analysis data and uses it as context for the AI
 */
export async function generateRagResponse(
	query: string,
	pondId?: string,
): Promise<{
	response: string;
	contextUsed: Array<{
		pondId: string;
		analysisId: string;
		similarity: number;
	}>;
	execution: {
		query: string;
		pondId?: string;
		retrievedCount: number;
		model: string;
		timestamp: string;
	};
}> {
	try {
		// Retrieve relevant analysis context
		const relevantAnalyses = await findRelevantAnalyses(query, pondId);

		// Build context from retrieved analyses
		const contextParts = relevantAnalyses.map((a, i) => {
			return `Analysis ${i + 1} (Pond: ${a.pondId}, Similarity: ${(a.similarity * 100).toFixed(1)}%):
${a.content}`;
		});

		const context =
			relevantAnalyses.length > 0
				? `\n\nRelevant Analysis Context:\n${contextParts.join("\n\n")}\n\n`
				: "";

		const { text } = await generateText({
			model: CHAT_MODEL,
			system: RAG_SYSTEM_PROMPT,
			prompt: `\n\nUser Query: ${query}\n\n${context}Please provide your professional analysis and advice.`,
			maxOutputTokens: 1000,
			temperature: 0.7,
		});

		return {
			response: text,
			contextUsed: relevantAnalyses.map((a) => ({
				pondId: a.pondId,
				analysisId: a.analysisId,
				similarity: a.similarity,
			})),
			execution: {
				query,
				pondId,
				retrievedCount: relevantAnalyses.length,
				model: "mistral/ministral-3b",
				timestamp: new Date().toISOString(),
			},
		};
	} catch (error) {
		console.error("Error generating RAG response:", error);
		throw error;
	}
}

/**
 * Get all stored analysis embeddings for a specific pond
 */
export async function getStoredAnalysesForPond(pondId: string): Promise<
	Array<{
		id: number;
		analysisId: string;
		createdAt: Date;
		metadata: any;
	}>
> {
	try {
		const results = await db
			.select({
				id: analysisEmbeddings.id,
				analysisId: analysisEmbeddings.analysisId,
				createdAt: analysisEmbeddings.createdAt,
				metadata: analysisEmbeddings.metadata,
			})
			.from(analysisEmbeddings)
			.where(eq(analysisEmbeddings.pondId, pondId))
			.orderBy(desc(analysisEmbeddings.createdAt))
			.execute();

		return results.map((r) => ({
			...r,
			metadata: JSON.parse(r.metadata),
		}));
	} catch (error) {
		console.error("Error getting stored analyses:", error);
		return [];
	}
}

/**
 * Delete analysis embeddings for a specific pond
 */
export async function deleteAnalysesForPond(pondId: string): Promise<number> {
	try {
		const result = await db
			.delete(analysisEmbeddings)
			.where(eq(analysisEmbeddings.pondId, pondId))
			.execute();

		return result.rowCount;
	} catch (error) {
		console.error("Error deleting analyses:", error);
		return 0;
	}
}
