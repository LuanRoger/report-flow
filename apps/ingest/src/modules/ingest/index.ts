import Elysia from "elysia";
import z from "zod";
import {
	createCycleBodySchema,
	createCycleResponseSchema,
	ingestManualRouteBodySchema,
} from "./schemas";
import { ingestData } from "./use-cases";
import { createCycle } from "./use-cases/create-cycle";

export const ingestModule = new Elysia({ prefix: "/ingest" })
	.post(
		"/cycles",
		async ({ body, status }) => {
			const cycle = await createCycle(body);

			return status("Created", cycle);
		},
		{
			body: createCycleBodySchema,
			detail: {
				description: "Create a pond cycle",
				operationId: "createCycle",
			},
			response: {
				201: createCycleResponseSchema,
				404: z.string(),
				500: z.string(),
			},
		}
	)
	.post(
		"/manual",
		async ({ set, body }) => {
			await ingestData(body);

			set.status = "Created";
		},
		{
			body: ingestManualRouteBodySchema,
			detail: {
				description: "Ingest data",
				operationId: "ingestManual",
			},
			response: {
				201: z.null(),
				500: z.string(),
			},
		}
	);
