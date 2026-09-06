import "server-only";

import ky, { type KyInstance } from "ky";
import { ENV } from "varlock/env";

let analysisApi: KyInstance | undefined;

export function getAnalysisApi() {
  if (analysisApi) {
    return analysisApi;
  }

  analysisApi = ky.create({
    baseUrl: ENV.ANALYSIS_API_URL,
    headers: {
      Authorization: `Bearer ${ENV.ANALYSIS_API_KEY}`,
    },
  });

  return analysisApi;
}
