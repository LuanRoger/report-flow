import { Elysia } from "elysia";
import { ingestModule } from "./modules/ingest";

const app = new Elysia()
	.get("/", () => "OK")
	.use(ingestModule)
	.listen(3000);

console.log(`Server running at ${app.server?.hostname}:${app.server?.port}`);
