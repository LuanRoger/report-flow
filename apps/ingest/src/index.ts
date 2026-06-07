import { Elysia } from "elysia";
import logixlysia from "logixlysia";
import { ingestModule } from "./modules/ingest";

new Elysia()
	.use(
		logixlysia({
			config: {
				slowThreshold: 100,
				verySlowThreshold: 500,
			},
		}),
	)
	.get("/", () => "OK")
	.use(ingestModule)
	.listen(3000);
