import { PondNotFoundError } from "@/modules/ponds/models/errors";
import { getPondById } from "@/modules/ponds/repository";
import { createCycle as createCycleRepository } from "../repository";
import type { CreateCycle } from "../schemas/types";

export async function createCycle(data: CreateCycle) {
	const { pondId } = data;
	const pond = await getPondById(pondId);
	if (!pond) {
		throw new PondNotFoundError(pondId);
	}

	return await createCycleRepository(data);
}
