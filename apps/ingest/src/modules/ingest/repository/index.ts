import { db, measurements } from "@/db";
import type { CreateMeasurement } from "./types";

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
