import { InsufficientDataError, PondNotFoundError } from "../models/errors";
import { getMeasurementsForPond, pondExists } from "../repository";
import type { AnalysisQuery } from "../schemas/types";
import { calculateTimeWindow } from "../utils/date";
import { normalizeMeasurements } from "../utils/normalization";
import {
	buildPondScoreResult,
	calculateParameterTemporalScores,
	checkDataCoverage,
} from "../utils/scoring";

export async function performAnalysis(query: AnalysisQuery) {
	const {
		pondId,
		startDate: startDateQuery,
		endDate: endDateQuery,
		window,
	} = query;

	const { startDate, endDate } = calculateTimeWindow(
		window,
		startDateQuery,
		endDateQuery,
	);

	const exists = await pondExists(pondId);
	if (!exists) {
		throw new PondNotFoundError(pondId);
	}

	const measurements = await getMeasurementsForPond(pondId, startDate, endDate);

	if (measurements.length === 0) {
		throw new InsufficientDataError();
	}

	const coverageResult = checkDataCoverage(measurements);

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
		coverageResult.presentParameters,
	);

	return result;
}
