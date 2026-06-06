import Elysia from "elysia";
import { deleteAnalysisById } from "./repository";
import { analysisIdParamSchema, analysisQuerySchema } from "./schemas";
import { getAnalysisById, performAnalysis, storeAnalysis } from "./use-cases";

export const analysesModule = new Elysia({ prefix: "/analyses" })
	.get(
		"/:id",
		async ({ status, params: { id } }) => {
			const result = await getAnalysisById(id);

			return status("OK", result);
		},
		{
			params: analysisIdParamSchema,
		},
	)
	.post(
		"/",
		async ({ query, status }) => {
			const result = await performAnalysis(query);
			await storeAnalysis(result);

			return status("OK", {
				success: true,
				data: result,
			});
		},
		{
			query: analysisQuerySchema,
		},
	)
	.delete(
		"/:id",
		async ({ status, params: { id } }) => {
			const result = await deleteAnalysisById(id);

			return status("OK", result);
		},
		{
			params: analysisIdParamSchema,
		},
	);
