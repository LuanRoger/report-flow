import Elysia from "elysia";
import z from "zod";
import { ingestManualRouteBodySchema } from "./schemas";
import { ingestData } from "./use-cases";

export const ingestModule = new Elysia({ prefix: "/ingest" }).post(
  "/manual",
  async ({ set, body }) => {
    await ingestData(body);

    set.status = "Created";
  },
  {
    body: ingestManualRouteBodySchema,
    detail: {
      description: "Ingest data",
      operationId: "ingestManual",
    },
    response: {
      201: z.null(),
      500: z.string(),
    },
  }
);
