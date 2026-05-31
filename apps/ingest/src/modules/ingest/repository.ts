import { db, measurements } from "@/db";
import type { IngestManualRouteBody } from "./schemas/types";

export async function registerMesurement(data: IngestManualRouteBody) {
	try {
		const result = await db
			.insert(measurements)
			.values({
				farmId: data.farmId,
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
