import Elysia from "elysia";
import { deleteAnalysisById } from "./repository";
import {
	analysisBodySchema,
	analysisIdParamSchema,
	createAnalysisCycleIdParamSchema,
} from "./schemas";
import {
	getAnalysisById,
	performAnalysisByCycle,
	performAnalysisByPond,
	storeAnalysis,
} from "./use-cases";

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
			params: createAnalysisCycleIdParamSchema,
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
