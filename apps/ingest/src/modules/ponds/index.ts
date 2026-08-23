import Elysia from "elysia";
import z from "zod";
import { createPondBodySchema } from "./schemas";
import { createPond } from "./use-cases";

const createPondResponseSchema = z.object({
	cycle: z.number().nullable(),
	id: z.number(),
});

export const pondsModule = new Elysia({ prefix: "/ponds" }).post(
	"/",
	async ({ body, status }) => {
		const pond = await createPond(body);

		return status("Created", pond);
	},
	{
		body: createPondBodySchema,
		detail: {
			description: "Create a pond",
			operationId: "createPond",
		},
		response: {
			201: createPondResponseSchema,
			500: z.string(),
		},
	}
);
