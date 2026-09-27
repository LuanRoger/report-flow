"use server";

import { getAnalysisApi } from "@/lib/http";
import { actionClient } from "@/lib/safe-actions";
import {
  analysesByPondResponseSchema,
  analysisByIdResponseSchema,
  analysisDetailsSchema,
  getAnalysesByPondInputSchema,
  getAnalysisByIdInputSchema,
} from "./schemas";

export const getAnalysesByPondAction = actionClient
  .inputSchema(getAnalysesByPondInputSchema)
  .outputSchema(analysesByPondResponseSchema)
  .action(
    async ({ parsedInput: { pondId } }) =>
      await getAnalysisApi()
        .get(`/analyses/ponds/${pondId}`, { cache: "no-store" })
        .json(analysesByPondResponseSchema)
  );

export const getAnalysisByIdAction = actionClient
  .inputSchema(getAnalysisByIdInputSchema)
  .outputSchema(analysisByIdResponseSchema)
  .action(async ({ parsedInput: { analysisId } }) => {
    const response = await getAnalysisApi().get(`/analyses/${analysisId}`, {
      cache: "no-store",
      throwHttpErrors: false,
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Unable to load analysis ${analysisId}`);
    }

    const json: unknown = await response.json();
    return analysisDetailsSchema.parse(json);
  });
