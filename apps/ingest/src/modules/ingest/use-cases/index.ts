import { CycleIsNotFromPondError } from "../models/error";
import { getPondCycle, registerMesurement } from "../repository";
import type { IngestManualRouteBody } from "../schemas/types";

export async function ingestData(data: IngestManualRouteBody) {
	const { pondId } = data;

	const cycle = await getPondCycle(pondId);
	if (!cycle) {
		throw new CycleIsNotFromPondError(pondId);
	}

	return await registerMesurement(data);
}
