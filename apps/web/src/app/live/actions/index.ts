"use server";

import { getAnalysisApi } from "@/lib/http";
import { actionClient } from "@/lib/safe-actions";
import {
  liveMeasurementsInputSchema,
  liveMeasurementsSnapshotSchema,
} from "./schemas";

export const getLiveMeasurementsAction = actionClient
  .inputSchema(liveMeasurementsInputSchema)
  .outputSchema(liveMeasurementsSnapshotSchema)
  .action(async ({ parsedInput }) => {
    const analysisApi = getAnalysisApi();
    const searchParams = new URLSearchParams({
      bucket: parsedInput.bucket,
      window: parsedInput.window,
    });
    const response = await analysisApi
      .get(
        `/measurements/ponds/${parsedInput.pondId}/realtime?${searchParams.toString()}`,
        { cache: "no-store" }
      )
      .json(liveMeasurementsSnapshotSchema);

    return response;
  });
