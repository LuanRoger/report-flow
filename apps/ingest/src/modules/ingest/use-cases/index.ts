import { CycleIsNotFromPondError } from "@/modules/cycles/models/errors";
import { getPondCycle, registerMesurement } from "../repository";
import type { IngestManualRouteBody } from "../schemas/types";

export async function ingestData(data: IngestManualRouteBody) {
  const { cycleId, pondId } = data;

  const cycle = await getPondCycle(cycleId, pondId);
  if (!cycle) {
    throw new CycleIsNotFromPondError(pondId);
  }

  return await registerMesurement(data);
}
