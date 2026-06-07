import { db, measurements } from "@/db";
import type { IngestManualRouteBody } from "./schemas/types";

export async function getPondCycle(pondId: number) {
	return await db.query.pondCycles.findFirst({
		where: {
			pondId,
		},
	});
}

export async function registerMesurement(data: IngestManualRouteBody) {
	try {
		const result = await db
			.insert(measurements)
			.values({
				pondId: data.pondId,
				cycleId: data.cycleId,
				parameterCode: data.parameterCode,
				recordedAt: data.recordedAt,
				value: data.value,
				unit: data.unit,
				sourceType: data.source,
			})
			.returning();
		return result[0];
	} catch (error) {
		console.log(error);
	}
}
