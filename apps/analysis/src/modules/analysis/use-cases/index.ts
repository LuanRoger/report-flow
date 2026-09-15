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
import type { CreateAnalysisEmbedding, Measurement } from "../repository/types";
import type {
  AnalysisGenerationOptionsInput,
  AnalysisQuery,
  ScoreResult,
} from "../schemas/types";
import { generateAiSummary } from "../utils/ai-summary";
import { calculateTimeWindow } from "../utils/date";
import type { AnalysisExecutionTimer } from "../utils/execution-timing";
import {
  EXPECTED_COLLECTION_INTERVAL_SECONDS,
  MAXIMUM_CONTINUITY_GAP_SECONDS,
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

interface StoreAnalysisScoreResultOptions {
  executionTimer?: AnalysisExecutionTimer;
  generateEmbedding?: boolean;
}

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
  requestedEndDate: Date,
  maximumContinuityGapSeconds: number
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
    requestedEndDate,
    maximumContinuityGapSeconds
  );

  return buildScoreResult(
    pondId,
    requestedStartDate,
    requestedEndDate,
    actualStartDate,
    actualEndDate,
    minimalMeasurements,
    parameterTemporalScores,
    normalizedByParameter,
    maximumContinuityGapSeconds
  );
}

async function maybeGenerateAiSummary(
  result: ScoreResult,
  generateSummary: boolean,
  executionTimer?: AnalysisExecutionTimer
): Promise<ScoreResult> {
  if (!generateSummary) {
    return result;
  }

  const aiSummary = executionTimer
    ? await executionTimer.measureAsync("summary", () =>
        generateAiSummary(result)
      )
    : await generateAiSummary(result);

  return {
    ...result,
    aiSummary,
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
  query: AnalysisQuery,
  executionTimer?: AnalysisExecutionTimer
): Promise<ScoreResult> {
  const {
    endDate: endDateQuery,
    generateAiSummary: shouldGenerateAiSummary,
    maximumContinuityGapSeconds = MAXIMUM_CONTINUITY_GAP_SECONDS,
    startDate: startDateQuery,
    window,
  } = query;
  const { endDate, startDate } = calculateTimeWindow(
    window,
    startDateQuery,
    endDateQuery
  );
  const loadMeasurements = async (): Promise<Measurement[]> => {
    const pond = await getPondByIdRepository(pondId);

    if (!pond) {
      throw new PondNotFoundError(pondId);
    }

    return await getMeasurementsForPondRepository(pondId, startDate, endDate);
  };
  const measurements = executionTimer
    ? await executionTimer.measureAsync("databaseQuery", loadMeasurements)
    : await loadMeasurements();

  if (measurements.length === 0) {
    throw new InsufficientDataError();
  }

  const analyze = (): ScoreResult =>
    performCoreAnalysis(
      pondId,
      measurements,
      startDate,
      endDate,
      maximumContinuityGapSeconds
    );
  const result = executionTimer
    ? executionTimer.measureSync("deterministicScore", analyze)
    : analyze();

  return await maybeGenerateAiSummary(
    result,
    shouldGenerateAiSummary,
    executionTimer
  );
}

export async function performAnalysisByCycle(
  cycleId: number,
  options: AnalysisGenerationOptionsInput = {},
  executionTimer?: AnalysisExecutionTimer
): Promise<ScoreResult> {
  const {
    generateAiSummary: shouldGenerateAiSummary = true,
    maximumContinuityGapSeconds = MAXIMUM_CONTINUITY_GAP_SECONDS,
  } = options;
  const loadMeasurements = (): Promise<Measurement[]> =>
    getMeasurementsForCycleRepository(cycleId);
  const measurements = executionTimer
    ? await executionTimer.measureAsync("databaseQuery", loadMeasurements)
    : await loadMeasurements();

  if (measurements.length === 0) {
    throw new InsufficientDataError();
  }

  const analyze = (): ScoreResult => {
    const { actualEndDate, actualStartDate } =
      findActualDateRange(measurements);
    const requestedEndDate = new Date(
      actualEndDate.getTime() +
        EXPECTED_COLLECTION_INTERVAL_SECONDS * MILLISECONDS_PER_SECOND
    );

    return performCoreAnalysis(
      measurements[0].pondId,
      measurements,
      actualStartDate,
      requestedEndDate,
      maximumContinuityGapSeconds
    );
  };
  const result = executionTimer
    ? executionTimer.measureSync("deterministicScore", analyze)
    : analyze();

  return await maybeGenerateAiSummary(
    result,
    shouldGenerateAiSummary,
    executionTimer
  );
}

export async function storeAnalysisScoreResult(
  result: ScoreResult,
  cycleId?: number,
  options: StoreAnalysisScoreResultOptions = {}
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
  const shouldGenerateEmbedding = options.generateEmbedding ?? true;
  const createEmbedding = async (): Promise<CreateAnalysisEmbedding> => {
    const content = formatAnalysisForEmbedding(result);
    const embedding = await generateEmbedding(content);

    return { content, embedding };
  };
  let embeddingData: CreateAnalysisEmbedding | null = null;

  if (shouldGenerateEmbedding) {
    embeddingData = options.executionTimer
      ? await options.executionTimer.measureAsync("embedding", createEmbedding)
      : await createEmbedding();
  }

  const persist = (): Promise<void> =>
    storeAnalysisResultRepository(
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
      embeddingData,
      aiSummary
    );

  if (options.executionTimer) {
    await options.executionTimer.measureAsync("persistence", persist);
    return;
  }

  await persist();
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
