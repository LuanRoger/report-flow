import Elysia from "elysia";
import { getAllPondIds } from "./repository";
import { analysisQuerySchema } from "./schemas";
import { performAnalysis } from "./use-cases";
import { generateAiSummary } from "./utils/ai-summary";
import { generateHtmlReport } from "./utils/report";

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

export const analysisModule = new Elysia({ prefix: "/analysis" })
	.use(aiModule)
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

			return htmlReport;
		},
		{
			query: analysisQuerySchema,
		},
	);
