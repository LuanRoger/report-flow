import {
	AnalysisNotFound,
	InsufficientDataError,
	PondNotFoundError,
} from "../models/errors";
import * as repository from "../repository";
import type { AnalysisQuery, PondScoreResult } from "../schemas/types";
import { calculateTimeWindow } from "../utils/date";
import { normalizeMeasurements } from "../utils/normalization";
import { formatAnalysisForEmbedding, generateEmbedding } from "../utils/rag";
import {
	buildPondScoreResult,
	calculateParameterTemporalScores,
	checkDataCoverage,
} from "../utils/scoring";

export async function getAnalysisById(id: number) {
	const analysis = await repository.getAnalysisById(id);
	if (!analysis) {
		throw new AnalysisNotFound(id);
	}

	return analysis;
}

export async function performAnalysis(
	query: AnalysisQuery,
): Promise<PondScoreResult> {
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

	const pond = await repository.getPondById(pondId);
	if (!pond) {
		throw new PondNotFoundError(pondId);
	}

	const measurements = await repository.getMeasurementsForPond(
		pondId,
		startDate,
		endDate,
	);

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

	const normalizedByParameter = normalizeMeasurements(measurements);

	const parameterTemporalScores = calculateParameterTemporalScores(
		normalizedByParameter,
	);

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

export async function storeAnalysis(result: PondScoreResult) {
	const { pondId, finalScore, parameterScores, startDate, endDate, metadata } =
		result;

	const embeddingContent = formatAnalysisForEmbedding(result);
	const embedding = await generateEmbedding(embeddingContent);

	await repository.storeAnalysisResult(
		{
			pondId,
			finalScore,
			startTime: startDate,
			endTime: endDate,
			metadata: JSON.stringify(metadata),
			temperatureScore: parameterScores.temperature,
			phScore: parameterScores.ph,
			dissolvedOxygenScore: parameterScores.dissolvedOxygen,
			salinityScore: parameterScores.salinity,
			turbidityScore: parameterScores.turbidity,
		},
		{
			content: embeddingContent,
			embedding,
		},
	);
}

export async function deleteAnalysisById(id: number) {
	const analysis = getAnalysisById(id);
	if (!analysis) {
		throw new AnalysisNotFound(id);
	}

	await deleteAnalysisById(id);
	return analysis;
}
