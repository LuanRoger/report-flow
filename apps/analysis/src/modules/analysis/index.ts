import Elysia from "elysia";
import { html } from "@elysiajs/html";
import { getAllPondIds } from "./repository";
import { analysisQuerySchema } from "./schemas";
import { performAnalysis } from "./use-cases";
import { generateHtmlReport } from "./utils/report";
import { generateAiSummary } from "./utils/ai-summary";

export const analysisModule = new Elysia({ prefix: "/analysis" })
	.use(html())
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
		async ({ query, set }) => {
			const result = await performAnalysis(query);
			const aiSummary = await generateAiSummary(result);
			const htmlReport = generateHtmlReport(result, { aiSummary });

			set.headers["Content-Type"] = "text/html; charset=utf-8";
			return html(htmlReport);
		},
		{
			query: analysisQuerySchema,
		},
	);
