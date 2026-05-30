import Elysia, { t } from "elysia";
import {
	getMeasurementsForPond,
	pondExists,
	getAllPondIds,
} from "./repository";
import {
	normalizeMeasurements,
	calculateParameterTemporalScores,
	buildPondScoreResult,
	checkDataCoverage,
} from "../../utils/scoring";
import { analysisQuerySchema } from "./schemas";
import type { ParameterCode } from "database";

// Predefined time windows in days
const TIME_WINDOWS: Record<string, number> = {
	"7d": 7,
	"30d": 30,
	"90d": 90,
};

/**
 * Parse date string to Date object
 */
function parseDate(dateString: string | undefined): Date | null {
	if (!dateString) return null;
	const date = new Date(dateString);
	return isNaN(date.getTime()) ? null : date;
}

/**
 * Calculate time window dates based on query parameters
 */
function calculateTimeWindow(
	startDate: Date | null,
	endDate: Date | null,
	window: string,
): { startDate: Date; endDate: Date } {
	const now = new Date();

	// If custom dates are provided, use them
	if (startDate && endDate) {
		return { startDate, endDate };
	}

	// If only start date is provided
	if (startDate && !endDate) {
		return { startDate, endDate: now };
	}

	// If only end date is provided
	if (!startDate && endDate) {
		const days = TIME_WINDOWS[window] || 7;
		const start = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
		return { startDate: start, endDate };
	}

	// Use predefined window
	const days = TIME_WINDOWS[window] || 7;
	const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
	return { startDate: start, endDate: now };
}

/**
 * Main analysis handler
 */
async function handleAnalysis(query: {
	pondId: string;
	startDate?: string;
	endDate?: string;
	window?: string;
}) {
	const pondId = query.pondId;
	const window = query.window || "7d";

	// Parse dates
	const parsedStartDate = parseDate(query.startDate);
	const parsedEndDate = parseDate(query.endDate);

	// Calculate time window
	const { startDate, endDate } = calculateTimeWindow(
		parsedStartDate,
		parsedEndDate,
		window,
	);

	// Check if pond exists
	const exists = await pondExists(pondId);
	if (!exists) {
		throw new Error(`Pond with ID '${pondId}' not found`);
	}

	// Fetch measurements for the pond within the time range
	const measurements = await getMeasurementsForPond(pondId, startDate, endDate);

	if (measurements.length === 0) {
		throw new Error(
			`No measurements found for pond '${pondId}' in the specified time range`,
		);
	}

	// Check data coverage (at least 70% of expected parameters)
	const expectedParameters: ParameterCode[] = [
		"temperature",
		"ph",
		"salinity",
		"dissolved_oxygen",
		"turbidity",
	];

	const coverageResult = checkDataCoverage(measurements, expectedParameters);

	// Get actual data range from measurements
	const recordedAtDates = measurements.map((m) => m.recordedAt);
	const actualStartDate = new Date(
		Math.min(...recordedAtDates.map((d) => d.getTime())),
	);
	const actualEndDate = new Date(
		Math.max(...recordedAtDates.map((d) => d.getTime())),
	);

	// Normalize measurements
	const normalizedByParameter = normalizeMeasurements(measurements);

	// Calculate parameter temporal scores
	const parameterTemporalScores = calculateParameterTemporalScores(
		normalizedByParameter,
	);

	// Build the final result with enhanced metadata
	const result = buildPondScoreResult(
		pondId,
		startDate,
		endDate,
		actualStartDate,
		actualEndDate,
		measurements,
		parameterTemporalScores,
		normalizedByParameter,
		coverageResult.hasSufficientCoverage,
		coverageResult.coveragePercentage,
		expectedParameters,
		coverageResult.presentParameters,
	);

	return result;
}

/**
 * Create the analysis module
 */
export const analysisModule = new Elysia({ prefix: "/analysis" })
	.get(
		"/",
		async ({ query, set }) => {
			try {
				// Validate query parameters using Zod
				const validatedQuery = analysisQuerySchema.parse(query);

				const result = await handleAnalysis(validatedQuery);

				return {
					success: true,
					data: result,
				};
			} catch (error) {
				if (error instanceof Error) {
					set.status = error.message.includes("not found") ? 404 : 400;
					return {
						success: false,
						error: error.message,
					};
				}

				set.status = 500;
				return {
					success: false,
					error: "Internal server error",
				};
			}
		},
		{
			query: t.Object({
				pondId: t.String({ minLength: 1 }),
				startDate: t.Optional(t.String({ format: "date-time" })),
				endDate: t.Optional(t.String({ format: "date-time" })),
				window: t.Optional(
					t.Union([
						t.Literal("7d"),
						t.Literal("30d"),
						t.Literal("90d"),
						t.Literal("custom"),
					]),
				),
			}),
		},
	)
	.get("/ponds", async () => {
		try {
			// Get all available pond IDs
			const pondIds = await getAllPondIds();
			return {
				success: true,
				data: { pondIds },
			};
		} catch (error) {
			return {
				success: false,
				error: "Failed to fetch pond IDs",
			};
		}
	});
