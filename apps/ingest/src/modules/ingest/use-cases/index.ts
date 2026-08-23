import { CycleIsNotFromPondError } from "@/modules/cycles/models/errors";
import { getPondCycle, registerMesurement } from "../repository";
import type { IngestManualRouteBody } from "../schemas/types";

export async function ingestData(data: IngestManualRouteBody) {
	const { pondId } = data;

	const cycle = await getPondCycle(pondId);
	if (cycle && cycle.pondId !== pondId) {
		throw new CycleIsNotFromPondError(pondId);
	}

	return await registerMesurement(data);
}
