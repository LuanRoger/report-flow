"use server";

import { ENV } from "varlock/env";
import { z } from "zod";
import { actionClient } from "@/lib/safe-actions";

const parameterCodes = [
  "temperature",
  "ph",
  "salinity",
  "turbidity",
  "dissolvedOxygen",
] as const;
const unitCodes = ["°C", "pH", "ppt", "NTU", "mg/L"] as const;

const measurementSchema = z.object({
  createdAt: z.iso.datetime(),
  cycleId: z.number(),
  id: z.number(),
  parameterCode: z.enum(parameterCodes),
  pondId: z.number(),
  recordedAt: z.iso.datetime(),
  sourceFile: z.string().nullable(),
  sourceType: z.string(),
  unit: z.enum(unitCodes),
  value: z.number(),
});

const measurementsPageSchema = z.object({
  items: z.array(measurementSchema),
  pagination: z.object({
    hasNextPage: z.boolean(),
    limit: z.number().int().positive(),
    nextCursor: z.string().nullable(),
  }),
});

const paginationInputSchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(25),
});

const measurementsInputSchema = z.discriminatedUnion("scope", [
  paginationInputSchema.extend({
    pondId: z.number().int().positive(),
    scope: z.literal("pond"),
  }),
  paginationInputSchema.extend({
    cycleId: z.number().int().positive(),
    scope: z.literal("cycle"),
  }),
]);

function getAnalysisApiConfiguration(): { apiKey: string; baseUrl: string } {
  const apiKey = ENV.ANALYSIS_API_KEY;
  if (!apiKey) {
    throw new Error("The analysis API key is not configured");
  }

  return {
    apiKey,
    baseUrl: ENV.ANALYSIS_API_URL,
  };
}

export const getMeasurementsAction = actionClient
  .inputSchema(measurementsInputSchema)
  .outputSchema(measurementsPageSchema)
  .action(async ({ parsedInput }) => {
    const { apiKey, baseUrl } = getAnalysisApiConfiguration();
    const resource =
      parsedInput.scope === "pond"
        ? `ponds/${parsedInput.pondId}`
        : `cycles/${parsedInput.cycleId}`;
    const searchParams = new URLSearchParams({
      limit: parsedInput.limit.toString(),
    });

    if (parsedInput.cursor) {
      searchParams.set("cursor", parsedInput.cursor);
    }

    const response = await fetch(
      `${baseUrl}/measurements/${resource}?${searchParams.toString()}`,
      {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Unable to load measurements (${response.status})`);
    }

    return measurementsPageSchema.parse(await response.json());
  });
