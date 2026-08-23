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
import type { AnalysisQuery, ScoreResult } from "../schemas/types";
import { generateAiSummary } from "../utils/ai-summary";
import { calculateTimeWindow } from "../utils/date";
import { normalizeMeasurements } from "../utils/normalization";
import { formatAnalysisForEmbedding, generateEmbedding } from "../utils/rag";
import { generateHtmlReport } from "../utils/report";
import {
  buildScoreResult,
  calculateParameterTemporalScores,
  checkDataCoverage,
} from "../utils/scoring";

async function performCoreAnalysis(
  pondId: number,
  measurements: Measurement[],
  requestedStartDate: Date,
  requestedEndDate: Date
): Promise<ScoreResult> {
  const coverageResult = checkDataCoverage(measurements);

  const recordedAtDates = measurements.map((m) => m.recordedAt);
  const actualStartDate = new Date(
    Math.min(...recordedAtDates.map((d) => d.getTime()))
  );
  const actualEndDate = new Date(
    Math.max(...recordedAtDates.map((d) => d.getTime()))
  );
  const minimalMeasurements = measurements.map((measurement) => ({
    parameterCode: measurement.parameterCode,
    recordedAt: measurement.recordedAt,
    value: measurement.value,
  }));

  const normalizedByParameter = normalizeMeasurements(minimalMeasurements);

  const parameterTemporalScores = calculateParameterTemporalScores(
    normalizedByParameter
  );

  const scoreResult = buildScoreResult(
    pondId,
    requestedStartDate,
    requestedEndDate,
    actualStartDate,
    actualEndDate,
    minimalMeasurements,
    parameterTemporalScores,
    normalizedByParameter,
    coverageResult.hasSufficientCoverage,
    coverageResult.coveragePercentage,
    coverageResult.presentParameters
  );

  const aiSummary = await generateAiSummary(scoreResult);
  return { ...scoreResult, aiSummary };
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
  const { startDate: startDateQuery, endDate: endDateQuery, window } = query;

  const { startDate, endDate } = calculateTimeWindow(
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

  return performCoreAnalysis(pondId, measurements, startDate, endDate);
}

export async function performAnalysisByCycle(
  cycleId: number
): Promise<ScoreResult> {
  const measurements = await getMeasurementsForCycleRepository(cycleId);

  if (measurements.length === 0) {
    throw new InsufficientDataError();
  }

  const { pondId } = measurements[0];

  const actualStartDate = new Date(
    Math.min(...measurements.map((m) => m.recordedAt.getTime()))
  );
  const actualEndDate = new Date(
    Math.max(...measurements.map((m) => m.recordedAt.getTime()))
  );

  return performCoreAnalysis(
    pondId,
    measurements,
    actualStartDate,
    actualEndDate
  );
}

export async function storeAnalysisScoreResult(
  result: ScoreResult,
  cycleId?: number
) {
  const {
    pondId,
    finalScore,
    parameterScores,
    startDate,
    endDate,
    metadata,
    aiSummary,
  } = result;

  const embeddingContent = formatAnalysisForEmbedding(result);
  const embedding = await generateEmbedding(embeddingContent);

  await storeAnalysisResultRepository(
    {
      aiSummary,
      cycleId,
      dissolvedOxygenScore: parameterScores.dissolvedOxygen,
      endTime: endDate,
      finalScore,
      metadata: JSON.stringify(metadata),
      phScore: parameterScores.ph,
      pondId,
      salinityScore: parameterScores.salinity,
      startTime: startDate,
      temperatureScore: parameterScores.temperature,
      turbidityScore: parameterScores.turbidity,
    },
    {
      content: embeddingContent,
      embedding,
    }
  );
}

export async function deleteAnalysisById(id: number) {
  const analysis = getAnalysisById(id);

  await deleteAnalysisByIdRepository(id);
  return analysis;
}

export async function generateReportForAnalysis(analysisId: number) {
  const analysis = await getAnalysisByIdRepository(analysisId);
  if (!analysis) {
    throw new AnalysisNotFound(analysisId);
  }

  const report = generateHtmlReport(analysis);

  return report;
}
