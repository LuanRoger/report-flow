import Elysia from "elysia";
import z from "zod";
import {
	createCycleBodySchema,
	createCycleResponseSchema,
} from "./cycles/schemas";
import { createCycle } from "./cycles/use-cases";

export const cyclesModule = new Elysia({ prefix: "/cycles" }).post(
	"/",
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
);
