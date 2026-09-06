import { getAnalysisApi } from "@/lib/http";
import { actionClient } from "@/lib/safe-actions";
import {
  getPondCyclesInputSchema,
  getPondCyclesResponseSchema,
  getPondsResponseSchema,
} from "./schemas";

export const getPonds = actionClient.action(async () => {
  const response = await getAnalysisApi().get("/ponds");

  const json = await response.json();
  const result = getPondsResponseSchema.parse(json);
  return result;
});

export const getPondCycles = actionClient
  .inputSchema(getPondCyclesInputSchema)
  .action(async ({ parsedInput }) => {
    const { id } = parsedInput;
    const response = await getAnalysisApi().get(`/ponds/${id}/cycles`);

    const json = await response.json();
    const result = getPondCyclesResponseSchema.parse(json);
    return result;
  });
