import Elysia from "elysia";
import z from "zod";
import {
  getPondCycleResponseSchema,
  getPondCyclesResponseSchema,
  getPondsResponseSchema,
  pondIdParamSchema,
} from "./schemas";
import { getPondCycleById, getPonds } from "./use-cases";

export const pondsCyclesModule = new Elysia({ prefix: "/ponds" })
  .get(
    "/",
    async () => {
      const ponds = await getPonds();
      const response = getPondsResponseSchema.parse(ponds);

      return response;
    },
    {
      detail: {
        description: "Get all ponds",
        operationId: "getPonds",
      },
      response: {
        200: getPondsResponseSchema,
        400: z.string(),
        404: z.string(),
        500: z.string(),
      },
    }
  )
  .get(
    "/:id/cycles",
    async ({ params }) => {
      const { id } = params;

      const cycles = await getPondCycleById(id);
      const response = getPondCyclesResponseSchema.parse(cycles);

      return response;
    },
    {
      detail: {
        description: "Get pond cycles by id",
        operationId: "getPondCycles",
      },
      params: pondIdParamSchema,
      response: {
        200: getPondCyclesResponseSchema,
        400: z.string(),
        404: z.string(),
        500: z.string(),
      },
    }
  )
  .get(
    "/:id/cycle",
    async ({ params }) => {
      const { id } = params;

      const cycle = await getPondCycleById(id);

      const response = getPondCycleResponseSchema.parse(cycle);
      return response;
    },
    {
      detail: {
        description: "Get current pond cycle",
        operationId: "getPondCycle",
      },
      params: pondIdParamSchema,
      response: {
        200: getPondCycleResponseSchema,
        400: z.string(),
        404: z.string(),
        500: z.string(),
      },
    }
  );
