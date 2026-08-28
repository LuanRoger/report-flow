"use server";

import { getAnalysisApi } from "@/lib/http";
import { actionClient } from "@/lib/safe-actions";
import { measurementsInputSchema, measurementsPageSchema } from "./schemas";

export const getMeasurementsAction = actionClient
  .inputSchema(measurementsInputSchema)
  .outputSchema(measurementsPageSchema)
  .action(async ({ parsedInput }) => {
    const analysisApi = getAnalysisApi();
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

    const response = await analysisApi
      .get(`/measurements/${resource}?${searchParams.toString()}`)
      .json(measurementsPageSchema);

    return response;
  });
