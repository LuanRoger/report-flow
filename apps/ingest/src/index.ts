import { Elysia } from "elysia";
import logixlysia from "logixlysia";
import { cors } from "@elysia/cors";
import bearer from "@elysia/bearer";
import { ingestModule } from "./modules/ingest";
import serverTiming from "@elysia/server-timing";
import openapi from "@elysia/openapi";
import { version } from "../package.json";
import z from "zod";
import { ENV } from "varlock/env";

const appName = "analysis";
const port = 3000;
const localUrl = `http://localhost:${port}`;

new Elysia()
	.use(
		logixlysia({
			config: {
				service: appName,
				showStartupMessage: true,
				startupMessageFormat: "simple",
				showContextTree: true,
				contextDepth: 2,
				slowThreshold: 50,
				verySlowThreshold: 100,
				ip: false,
			},
		}),
	)
	.use(
		cors({
			allowedHeaders: ["Content-Type", "Authorization"],
			methods: ["GET", "POST", "DELETE", "OPTIONS"],
		}),
	)
	.use(serverTiming())
	.use(
		openapi({
			documentation: {
				info: {
					title: appName,
					version,
					license: {
						name: "MIT",
					},
				},
				servers: [
					{
						url: localUrl,
						description: "Local server",
					},
				],
				components: {
					securitySchemes: {
						bearerAuth: {
							type: "http",
							scheme: "bearer",
						},
					},
				},
				openapi: "3.2.0",
			},
			scalar: {
				theme: "deepSpace",
				showOperationId: true,
				customCss: "",
			},
			mapJsonSchema: {
				zod: z.toJSONSchema,
			},
		}),
	)
	.use(bearer())
	.onBeforeHandle(({ set, status, bearer }) => {
		const apiKey = ENV.API_KEY;

		if (bearer !== apiKey) {
			set.status = 401;
			return status("Unauthorized");
		}
	})
	.use(ingestModule)
	.listen(port);
