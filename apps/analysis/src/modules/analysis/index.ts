import Elysia from "elysia";
import { z } from "zod";
import { getAllPondIds } from "./repository";
import { analysisQuerySchema, pondScoreResultSchema } from "./schemas";
import { performAnalysis } from "./use-cases";
import { generateAiSummary } from "./utils/ai-summary";
import {
	deleteAnalysesForPond,
	generateRagResponse,
	getStoredAnalysesForPond,
	storeAnalysisEmbedding,
} from "./utils/rag";
import { generateHtmlReport } from "./utils/report";

// Schema for chat endpoint
const chatQuerySchema = z.object({
	query: z.string().min(1, { error: "Query is required" }),
	pondId: z.string().optional(),
});

const aiModule = new Elysia({ prefix: "/ai" }).get(
	"/ai",
	async ({ query }) => {
		const result = await performAnalysis(query);
		const aiSummary = await generateAiSummary(result);

		return {
			success: true,
			data: {
				pondId: result.pondId,
				finalScore: result.finalScore,
				summary: aiSummary,
			},
		};
	},
	{
		query: analysisQuerySchema,
	},
);

// RAG/Chat module for conversational interaction
const chatModule = new Elysia({ prefix: "/chat" })
	// Store analysis embedding (called after analysis to build knowledge base)
	.post(
		"/store",
		async ({ body }) => {
			const { pondId, result } = body;

			if (!pondId || !result) {
				return {
					success: false,
					error: "pondId and result are required",
				};
			}

			try {
				await storeAnalysisEmbedding(pondId, result);

				return {
					success: true,
					message: "Analysis embedding stored successfully",
				};
			} catch (error) {
				return {
					success: false,
					error:
						error instanceof Error
							? error.message
							: "Failed to store embedding",
				};
			}
		},
		{
			body: z.object({
				pondId: z.string(),
				result: pondScoreResultSchema,
			}),
		},
	)
	// Get conversational response using RAG
	.post(
		"/",
		async ({ body }) => {
			const { query: userQuery, pondId } = body;

			try {
				const response = await generateRagResponse(userQuery, pondId);

				return {
					success: true,
					data: response,
				};
			} catch (error) {
				return {
					success: false,
					error:
						error instanceof Error
							? error.message
							: "Failed to generate response",
				};
			}
		},
		{
			body: chatQuerySchema,
		},
	)
	// Get stored analyses for a pond
	.get("/:pondId", async ({ params: { pondId } }) => {
		try {
			const analyses = await getStoredAnalysesForPond(pondId);

			return {
				success: true,
				data: { pondId, analyses },
			};
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to get analyses",
			};
		}
	})
	// Delete stored analyses for a pond
	.delete("/:pondId", async ({ params: { pondId } }) => {
		try {
			const deletedCount = await deleteAnalysesForPond(pondId);

			return {
				success: true,
				data: { pondId, deletedCount },
			};
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to delete analyses",
			};
		}
	});

export const analysisModule = new Elysia({ prefix: "/analysis" })
	.use(aiModule)
	.use(chatModule)
	.get(
		"/",
		async ({ query, status }) => {
			const result = await performAnalysis(query);

			return status("OK", {
				success: true,
				data: result,
			});
		},
		{
			query: analysisQuerySchema,
		},
	)
	.get("/ponds", async () => {
		const pondIds = await getAllPondIds();
		return {
			success: true,
			data: { pondIds },
		};
	})
	.get(
		"/report",
		async ({ query }) => {
			const result = await performAnalysis(query);
			const aiSummary = await generateAiSummary(result);
			const htmlReport = generateHtmlReport(result, { aiSummary });

			// Store the analysis embedding for RAG knowledge base
			// This is fire-and-forget - we don't wait for it to complete
			// to keep the report generation fast
			storeAnalysisEmbedding(result.pondId, result).catch((error) => {
				console.error("Failed to store analysis embedding:", error);
			});

			return htmlReport;
		},
		{
			query: analysisQuerySchema,
		},
	);
