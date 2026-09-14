import type { ParameterCode } from "database";
import {
  AnalysisNotFound,
  InsufficientDataError,
  PondNotFoundError,
} from "../models/errors";
import {
  deleteAnalysisById as deleteAnalysisByIdRepository,
  getAnalysisById as getAnalysisByIdRepository,
  getMeasurementsForCycle as getMeasurementsForCycleRepository,
  getMeasurementsForPond as getMeasurementsForPondRepository,
  getPondById as getPondByIdRepository,
  storeAnalysisResult as storeAnalysisResultRepository,
} from "../repository";
import type { Measurement } from "../repository/types";
import type {
  AnalysisGenerationOptions,
  AnalysisQuery,
  ScoreResult,
} from "../schemas/types";
import { generateAiSummary } from "../utils/ai-summary";
import { calculateTimeWindow } from "../utils/date";
import {
  EXPECTED_COLLECTION_INTERVAL_SECONDS,
  normalizeMeasurements,
  SCORING_PARAMETER_CODES,
} from "../utils/normalization";
import { formatAnalysisForEmbedding, generateEmbedding } from "../utils/rag";
import { generateHtmlReport } from "../utils/report";
import {
  buildScoreResult,
  calculateParameterTemporalScores,
} from "../utils/scoring";

const MILLISECONDS_PER_SECOND = 1000;

function findActualDateRange(measurements: Measurement[]): {
  actualEndDate: Date;
  actualStartDate: Date;
} {
  let maximumTimestamp = Number.NEGATIVE_INFINITY;
  let minimumTimestamp = Number.POSITIVE_INFINITY;

  for (const measurement of measurements) {
    const timestamp = measurement.recordedAt.getTime();
    maximumTimestamp = Math.max(maximumTimestamp, timestamp);
    minimumTimestamp = Math.min(minimumTimestamp, timestamp);
  }

  return {
    actualEndDate: new Date(maximumTimestamp),
    actualStartDate: new Date(minimumTimestamp),
  };
}

function findMissingParameters(measurements: Measurement[]): ParameterCode[] {
  const presentParameters = new Set(
    measurements.map((measurement) => measurement.parameterCode)
  );

  return SCORING_PARAMETER_CODES.filter(
    (parameterCode) => !presentParameters.has(parameterCode)
  );
}

function performCoreAnalysis(
  pondId: number,
  measurements: Measurement[],
  requestedStartDate: Date,
  requestedEndDate: Date
): ScoreResult {
  const missingParameters = findMissingParameters(measurements);
  if (missingParameters.length > 0) {
    throw new InsufficientDataError(missingParameters);
  }

  const { actualEndDate, actualStartDate } = findActualDateRange(measurements);
  const minimalMeasurements = measurements.map((measurement) => ({
    parameterCode: measurement.parameterCode,
    recordedAt: measurement.recordedAt,
    value: measurement.value,
  }));
  const normalizedByParameter = normalizeMeasurements(minimalMeasurements);
  const parameterTemporalScores = calculateParameterTemporalScores(
    normalizedByParameter,
    requestedStartDate,
    requestedEndDate
  );

  return buildScoreResult(
    pondId,
    requestedStartDate,
    requestedEndDate,
    actualStartDate,
    actualEndDate,
    minimalMeasurements,
    parameterTemporalScores,
    normalizedByParameter
  );
}

async function maybeGenerateAiSummary(
  result: ScoreResult,
  generateSummary: boolean
): Promise<ScoreResult> {
  if (!generateSummary) {
    return result;
  }

  return {
    ...result,
    aiSummary: await generateAiSummary(result),
  };
}

export async function getAnalysisById(id: number) {
  const analysis = await getAnalysisByIdRepository(id);
  if (!analysis) {
    throw new AnalysisNotFound(id);
  }

  return analysis;
}

export async function performAnalysisByPond(
  pondId: number,
  query: AnalysisQuery
): Promise<ScoreResult> {
  const {
    endDate: endDateQuery,
    generateAiSummary: shouldGenerateAiSummary,
    startDate: startDateQuery,
    window,
  } = query;
  const { endDate, startDate } = calculateTimeWindow(
    window,
    startDateQuery,
    endDateQuery
  );
  const pond = await getPondByIdRepository(pondId);

  if (!pond) {
    throw new PondNotFoundError(pondId);
  }

  const measurements = await getMeasurementsForPondRepository(
    pondId,
    startDate,
    endDate
  );
  if (measurements.length === 0) {
    throw new InsufficientDataError();
  }

  const result = performCoreAnalysis(pondId, measurements, startDate, endDate);
  return await maybeGenerateAiSummary(result, shouldGenerateAiSummary);
}

export async function performAnalysisByCycle(
  cycleId: number,
  options: AnalysisGenerationOptions = { generateAiSummary: true }
): Promise<ScoreResult> {
  const measurements = await getMeasurementsForCycleRepository(cycleId);
  if (measurements.length === 0) {
    throw new InsufficientDataError();
  }

  const { actualEndDate, actualStartDate } = findActualDateRange(measurements);
  const requestedEndDate = new Date(
    actualEndDate.getTime() +
      EXPECTED_COLLECTION_INTERVAL_SECONDS * MILLISECONDS_PER_SECOND
  );
  const result = performCoreAnalysis(
    measurements[0].pondId,
    measurements,
    actualStartDate,
    requestedEndDate
  );

  return await maybeGenerateAiSummary(result, options.generateAiSummary);
}

export async function storeAnalysisScoreResult(
  result: ScoreResult,
  cycleId?: number
): Promise<void> {
  const {
    aiSummary,
    endDate,
    finalScore,
    metadata,
    parameterScores,
    pondId,
    startDate,
  } = result;
  const embeddingContent = formatAnalysisForEmbedding(result);
  const embedding = await generateEmbedding(embeddingContent);

  await storeAnalysisResultRepository(
    {
      cycleId,
      dissolvedOxygenScore: parameterScores.dissolvedOxygen,
      endTime: endDate,
      finalScore,
      metadata,
      phScore: parameterScores.ph,
      pondId,
      salinityScore: parameterScores.salinity,
      startTime: startDate,
      temperatureScore: parameterScores.temperature,
    },
    {
      content: embeddingContent,
      embedding,
    },
    aiSummary
  );
}

export async function deleteAnalysisById(id: number) {
  const analysis = await getAnalysisById(id);
  await deleteAnalysisByIdRepository(id);
  return analysis;
}

export async function generateReportForAnalysis(
  analysisId: number
): Promise<string> {
  const analysis = await getAnalysisByIdRepository(analysisId);
  if (!analysis) {
    throw new AnalysisNotFound(analysisId);
  }

  return generateHtmlReport(analysis, { aiSummary: analysis.aiSummary });
}
