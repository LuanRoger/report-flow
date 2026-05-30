import type { ParameterCode } from "database";
import { db, measurements } from "database";
import { and, eq, gte, lte } from "drizzle-orm";

interface MeasurementRecord {
	pondId: string;
	parameterCode: ParameterCode;
	value: number;
	recordedAt: Date;
}

/**
 * Fetch measurements for a specific pond within a time range
 * Uses TimescaleDB hypertable query patterns for efficient time-series data retrieval
 */
export async function getMeasurementsForPond(
	pondId: string,
	startDate: Date,
	endDate: Date,
): Promise<MeasurementRecord[]> {
	try {
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
	} catch (error) {
		console.error("Error fetching measurements:", error);
		throw new Error("Failed to fetch measurements from database");
	}
}

/**
 * Get all unique pond IDs from the database
 */
export async function getAllPondIds(): Promise<string[]> {
	try {
		const result = await db
			.selectDistinct({ pondId: measurements.pondId })
			.from(measurements)
			.orderBy(measurements.pondId);

		return result.map((row) => row.pondId);
	} catch (error) {
		console.error("Error fetching pond IDs:", error);
		throw new Error("Failed to fetch pond IDs");
	}
}

/**
 * Check if a pond exists in the database
 */
export async function pondExists(pondId: string): Promise<boolean> {
	try {
		const result = await db
			.select({ pondId: measurements.pondId })
			.from(measurements)
			.where(eq(measurements.pondId, pondId))
			.limit(1);

		return result.length > 0;
	} catch (error) {
		console.error("Error checking pond existence:", error);
		throw new Error("Failed to check pond existence");
	}
}

/**
 * Get the time range of available data for a pond
 */
export async function getPondDataRange(
	pondId: string,
): Promise<{ startDate: Date | null; endDate: Date | null }> {
	try {
		const result = await db
			.select({
				minDate: measurements.recordedAt,
				maxDate: measurements.recordedAt,
			})
			.from(measurements)
			.where(eq(measurements.pondId, pondId))
			.orderBy(measurements.recordedAt, "asc")
			.limit(1);

		if (result.length === 0) {
			return { startDate: null, endDate: null };
		}

		// Get min and max dates
		const dates = await db
			.select({
				recordedAt: measurements.recordedAt,
			})
			.from(measurements)
			.where(eq(measurements.pondId, pondId))
			.orderBy(measurements.recordedAt);

		if (dates.length === 0) {
			return { startDate: null, endDate: null };
		}

		return {
			startDate: dates[0].recordedAt,
			endDate: dates[dates.length - 1].recordedAt,
		};
	} catch (error) {
		console.error("Error getting pond data range:", error);
		throw new Error("Failed to get pond data range");
	}
}
