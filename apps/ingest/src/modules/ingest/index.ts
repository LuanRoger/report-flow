import Elysia from "elysia";
import { ingestManualRouteBodySchema } from "./schemas";
import { ingestData } from "./use-cases";

export const ingestModule = new Elysia().group("/ingest", (app) =>
	app.post(
		"/manual",
		async ({ status, body }) => {
			const result = ingestData(body);

			return status("Created", { data: result });
		},
		{
			body: ingestManualRouteBodySchema,
		},
	),
);
