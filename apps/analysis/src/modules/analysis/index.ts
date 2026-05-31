import Elysia from "elysia";
import { getAllPondIds } from "./repository";
import { analysisQuerySchema } from "./schemas";
import { performAnalysis } from "./use-cases";

export const analysisModule = new Elysia({ prefix: "/analysis" })
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
	});
