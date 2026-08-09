import html from "@elysiajs/html";
import Elysia from "elysia";
import { analysisBodySchema, getAnalysisById200ResponseSchema, idParamSchema, performAnalysisByCycle200ResponseSchema, performAnalysisByPond200ResponseSchema } from "./schemas";
import {
	deleteAnalysisById,
	generateReportForAnalysis,
	getAnalysisById,
	performAnalysisByCycle,
	performAnalysisByPond,
	storeAnalysis,
} from "./use-cases";
import z from "zod";

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
			response: {
				200: z.string(),
				500: z.string(),
			},
			detail: {
				description:
					"Generate a report for the given analysis ID in HTML format",
				operationId: "getAnalysisReport",
			},
		},
	);

export const analysesModule = new Elysia({ prefix: "/analyses" })
	.use(analysesReportModule)
	.get(
		"/:id",
		async ({ status, params: { id } }) => {
			const result = await getAnalysisById(id);

			const response = getAnalysisById200ResponseSchema.parse(result);
			return status("OK", response);
		},
		{
			params: idParamSchema,
			response: {
				200: getAnalysisById200ResponseSchema,
				404: z.string(),
				500: z.string(),
			},
			detail: {
				description: "Get an analysis by its ID",
				operationId: "getAnalysisById",
			}
		},
	)
	.post(
		"/ponds/:id",
		async ({ body, params: { id }, status }) => {
			const result = await performAnalysisByPond(id, body);
			await storeAnalysis(result);

			return status("OK", result);
		},
		{
			params: idParamSchema,
			body: analysisBodySchema,
			response: {
				200: performAnalysisByPond200ResponseSchema,
				404: z.string(),
				500: z.string(),
			},
			detail: {
				description: "Perform analysis by pond",
				operationId: "performAnalysisByPond",
			}
		},
	)
	.post(
		"/cycles/:id",
		async ({ params: { id }, status }) => {
			const result = await performAnalysisByCycle(id);
			await storeAnalysis(result, id);

			return status("OK", result);
		},
		{
			params: idParamSchema,
			response: {
				200: performAnalysisByCycle200ResponseSchema,
				404: z.string(),
				500: z.string(),
			},
			detail: {
				description: "Perform analysis by cycle",
				operationId: "performAnalysisByCycle",
			}
		},
	)
	.delete(
		"/:id",
		async ({ set, params: { id } }) => {
			void await deleteAnalysisById(id);

			set.status = "No Content";
		},
		{
			params: idParamSchema,
			response: {
				204: z.string(),
				404: z.string(),
				500: z.string(),
			},
			detail: {
				description: "Delete an analysis by its ID",
				operationId: "deleteAnalysisById",
			}
		},
	);
