import { Elysia } from "elysia";
import { ingestManualRouteBodySchema } from "./schemas/routes/ingest";

const app = new Elysia()
	.get("/", () => "Hello World")
	.group("/ingest", (app) => {
		return app.post(
			"/manual",
			({ body, status }) => {
				return status("OK", body);
			},
			{
				body: ingestManualRouteBodySchema,
			},
		);
	})
	.listen(3000);

console.log(`Server running at ${app.server?.hostname}:${app.server?.port}`);
