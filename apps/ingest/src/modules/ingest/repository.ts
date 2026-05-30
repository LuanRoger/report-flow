import { measurements } from "@/db/schemas/measurements";
import { db } from "~/src/db";
import type { IngestManualRouteBody } from "./schemas/types";

export async function registerMesurement(data: IngestManualRouteBody) {
	const result = await db
		.insert(measurements)
		.values({
			farmId: data.farmId,
			pondId: data.pondId,
			cycleId: data.cycleId,
			parameterCode: data.parameterCode,
			recordedAt: data.recordedAt,
			value: data.value.toFixed(2),
			unit: data.unit,
			sourceType: "manual",
			sourceFile: null,
		})
		.returning();

	return result[0];
}
