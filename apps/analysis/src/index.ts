import { cors } from "@elysia/cors";
import { html } from "@elysiajs/html";
import { Elysia } from "elysia";
import { analysisModule } from "./modules/analysis";

const app = new Elysia()
	.use(cors())
	.use(html())
	.use(analysisModule)
	.listen(3001);

console.log(
	`Analysis service running at ${app.server?.hostname}:${app.server?.port}`,
);
