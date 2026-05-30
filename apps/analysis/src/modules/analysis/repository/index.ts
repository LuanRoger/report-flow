import type { ParameterCode } from "database";
import { db, measurements } from "database";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { DEFAULT_MIN_MAX_DATE } from "../constants";

interface MeasurementRecord {
	pondId: string;
	parameterCode: ParameterCode;
	value: number;
	recordedAt: Date;
}

export async function getMeasurementsForPond(
	pondId: string,
	startDate: Date,
	endDate: Date,
): Promise<MeasurementRecord[]> {
	const result = await db
		.select({
			pondId: measurements.pondId,
			parameterCode: measurements.parameterCode,
			value: measurements.value,
			recordedAt: measurements.recordedAt,
		})
		.from(measurements)
		.where(
			and(
				eq(measurements.pondId, pondId),
				gte(measurements.recordedAt, startDate),
				lte(measurements.recordedAt, endDate),
			),
		)
		.orderBy(measurements.recordedAt);

	return result.map((row) => ({
		pondId: row.pondId,
		parameterCode: row.parameterCode,
		value: Number(row.value),
		recordedAt: row.recordedAt,
	}));
}

export async function getAllPondIds(): Promise<string[]> {
	const result = await db.query.measurements.findMany({
		columns: {
			pondId: true,
		},
		orderBy: {
			pondId: "asc",
		},
	});

	return result.map((row) => row.pondId);
}

export async function pondExists(pondId: string): Promise<boolean> {
	const result = await db.query.measurements.findFirst({
		where: {
			pondId,
		},
	});

	return result !== undefined;
}

export async function getPondDataRange(
	pondId: string,
): Promise<{ startDate: Date | null; endDate: Date | null }> {
	const result = await db
		.select({
			minDate: measurements.recordedAt,
			maxDate: measurements.recordedAt,
		})
		.from(measurements)
		.where(eq(measurements.pondId, pondId))
		.orderBy(asc(measurements.recordedAt))
		.limit(1);

	if (result.length === 0) {
		return DEFAULT_MIN_MAX_DATE;
	}

	const dates = await db.query.measurements.findMany({
		columns: {
			recordedAt: true,
		},
		where: {
			pondId,
		},
		orderBy: {
			recordedAt: "desc",
		},
	});

	if (dates.length === 0) {
		return DEFAULT_MIN_MAX_DATE;
	}

	const firstDate = dates[0];
	const lastDate = dates[dates.length - 1];
	if (firstDate === undefined || lastDate === undefined) {
		return DEFAULT_MIN_MAX_DATE;
	}

	return {
		startDate: firstDate.recordedAt,
		endDate: lastDate.recordedAt,
	};
}
