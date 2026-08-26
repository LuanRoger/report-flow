import Elysia from "elysia";
import z from "zod";
import {
  measurementScopeParamsSchema,
  measurementsPageResponseSchema,
  measurementsQuerySchema,
  realtimeMeasurementsQuerySchema,
  realtimeMeasurementsResponseSchema,
} from "./schemas";
import {
  getMeasurementsByCycle,
  getMeasurementsByPond,
  getRealtimeMeasurementsByPond,
} from "./use-cases";

export const measurementsModule = new Elysia({ prefix: "/measurements" })
  .get(
    "/ponds/:id",
    async ({ params: { id }, query, status }) => {
      const result = await getMeasurementsByPond(id, query);

      return status("OK", result);
    },
    {
      detail: {
        description: "Get paginated measurements for a pond",
        operationId: "getMeasurementsByPond",
      },
      params: measurementScopeParamsSchema,
      query: measurementsQuerySchema,
      response: {
        200: measurementsPageResponseSchema,
        400: z.string(),
        404: z.string(),
        500: z.string(),
      },
    }
  )
  .get(
    "/ponds/:id/realtime",
    async ({ params: { id }, query, status }) => {
      const result = await getRealtimeMeasurementsByPond(id, query);

      return status("OK", result);
    },
    {
      detail: {
        description:
          "Get realtime chart aggregates for a pond's water measurements",
        operationId: "getRealtimeMeasurementsByPond",
      },
      params: measurementScopeParamsSchema,
      query: realtimeMeasurementsQuerySchema,
      response: {
        200: realtimeMeasurementsResponseSchema,
        404: z.string(),
        500: z.string(),
      },
    }
  )
  .get(
    "/cycles/:id",
    async ({ params: { id }, query, status }) => {
      const result = await getMeasurementsByCycle(id, query);

      return status("OK", result);
    },
    {
      detail: {
        description: "Get paginated measurements for a pond cycle",
        operationId: "getMeasurementsByCycle",
      },
      params: measurementScopeParamsSchema,
      query: measurementsQuerySchema,
      response: {
        200: measurementsPageResponseSchema,
        400: z.string(),
        404: z.string(),
        500: z.string(),
      },
    }
  );
