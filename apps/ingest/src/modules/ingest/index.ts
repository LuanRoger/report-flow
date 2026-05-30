import Elysia from "elysia";
import { registerMesurement } from "./repository";
import { ingestManualRouteBodySchema } from "./schemas";

export const ingestModule = new Elysia().group("/ingest", (app) =>
	app.post(
		"/",
		async ({ status, body }) => {
			const result = await registerMesurement(body);

			return status("Created", { data: result });
		},
		{
			body: ingestManualRouteBodySchema,
		},
	),
);
