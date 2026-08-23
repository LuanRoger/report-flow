import { PondNotFoundError } from "../models/error";
import { createCycle as createCycleRepository, getPond } from "../repository";
import type { CreateCycle } from "../schemas/types";

export async function createCycle(data: CreateCycle) {
	const pond = await getPond(data.pondId);
	if (!pond) {
		throw new PondNotFoundError(data.pondId);
	}

	return await createCycleRepository(data);
}
