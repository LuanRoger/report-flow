import { db, measurements, pondCycles } from "@/db";
import type { CreateCycle, CreateMeasurement } from "./types";

export async function getPondCycle(pondId: number) {
	return await db.query.pondCycles.findFirst({
		where: {
			pondId,
		},
	});
}

export async function registerMesurement(data: CreateMeasurement) {
	const result = await db.insert(measurements).values(data).returning();
	return result[0];
}

export async function getPond(pondId: number) {
	return await db.query.ponds.findFirst({
		where: {
			id: pondId,
		},
	});
}

export async function createCycle(data: CreateCycle) {
	const result = await db.insert(pondCycles).values(data).returning();
	if (result.length === 0) {
		throw new Error("Failed to create cycle");
	}

	return result[0];
}
