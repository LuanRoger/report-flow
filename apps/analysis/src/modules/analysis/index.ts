import html from "@elysiajs/html";
import Elysia from "elysia";
import { analysisBodySchema, idParamSchema } from "./schemas";
import {
	deleteAnalysisById,
	generateReportForAnalysis,
	getAnalysisById,
	performAnalysisByCycle,
	performAnalysisByPond,
	storeAnalysis,
} from "./use-cases";

export const analysesReportModule = new Elysia({ prefix: "/report" })
	.use(html())
	.get(
		"/:id",
		async ({ params: { id } }) => {
			const report = await generateReportForAnalysis(id);

			return report;
		},
		{
			params: idParamSchema,
		},
	);

export const analysesModule = new Elysia({ prefix: "/analyses" })
	.use(analysesReportModule)
	.get(
		"/:id",
		async ({ status, params: { id } }) => {
			const result = await getAnalysisById(id);

			return status("OK", result);
		},
		{
			params: idParamSchema,
		},
	)
	.post(
		"/ponds/:id",
		async ({ body, params: { id }, status }) => {
			const result = await performAnalysisByPond(id, body);
			await storeAnalysis(result);

			return status("OK", {
				success: true,
				data: result,
			});
		},
		{
			params: idParamSchema,
			body: analysisBodySchema,
		},
	)
	.post(
		"/cycles/:id",
		async ({ params: { id }, status }) => {
			const result = await performAnalysisByCycle(id);
			await storeAnalysis(result, id);

			return status("OK", {
				success: true,
				data: result,
			});
		},
		{
			params: idParamSchema,
		},
	)
	.delete(
		"/:id",
		async ({ status, params: { id } }) => {
			const result = await deleteAnalysisById(id);

			return status("OK", result);
		},
		{
			params: idParamSchema,
		},
	);
