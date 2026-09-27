import type { ParameterCode } from "database";
import type { ScoreResult } from "../schemas/types";
import type {
  NormalizedScore,
  ParameterMetrics,
  ParameterStats,
  ParameterTemporalScore,
  UnfavorableInterval,
} from "../types/analysis";
import {
  CRITICAL_THRESHOLD,
  MAXIMUM_CONTINUITY_GAP_SECONDS,
  MINIMUM_COVERAGE_PERCENTAGE,
  PARAMETER_WEIGHTS,
  SCORING_MODEL_VERSION,
  SCORING_PARAMETER_CODES,
  WINDOW_CONVENTION,
} from "./normalization";

const MILLISECONDS_PER_SECOND = 1000;

interface NumericStats {
  count: number;
  max: number | null;
  mean: number | null;
  min: number | null;
}

interface DataCoverageResult {
  coveragePercentage: number;
  hasSufficientCoverage: boolean;
  minimumRequiredPercentage: number;
  missingParameters: ParameterCode[];
  parameterCoverage: Record<
    ParameterCode,
    {
      coveragePercentage: number;
      coveredDurationSeconds: number;
      missingDurationSeconds: number;
    }
  >;
  presentParameters: ParameterCode[];
}

function clampScore(score: number): number {
  return Math.max(1, Math.min(100, score));
}

function calculateStats<T>(
  values: readonly T[],
  getValue: (value: T) => number
): NumericStats {
  if (values.length === 0) {
    return { count: 0, max: null, mean: null, min: null };
  }

  let maximum = Number.NEGATIVE_INFINITY;
  let minimum = Number.POSITIVE_INFINITY;
  let sum = 0;

  for (const value of values) {
    const numericValue = getValue(value);
    maximum = Math.max(maximum, numericValue);
    minimum = Math.min(minimum, numericValue);
    sum += numericValue;
  }

  return {
    count: values.length,
    max: maximum,
    mean: sum / values.length,
    min: minimum,
  };
}

export function calculateRawValueStats(values: number[]): NumericStats {
  return calculateStats(values, (value) => value);
}

export function calculateNormalizedScoreStats(scores: number[]): NumericStats {
  return calculateStats(scores, (score) => score);
}

function appendUnfavorableInterval(
  intervals: UnfavorableInterval[],
  startTime: number,
  endTime: number
): void {
  const durationSeconds = (endTime - startTime) / MILLISECONDS_PER_SECOND;
  const previousInterval = intervals.at(-1);

  if (previousInterval?.end.getTime() === startTime) {
    previousInterval.end = new Date(endTime);
    previousInterval.durationSeconds += durationSeconds;
    return;
  }

  intervals.push({
    durationSeconds,
    end: new Date(endTime),
    start: new Date(startTime),
  });
}

export function calculateTemporalMetrics(
  scores: NormalizedScore[],
  requestedStart: Date,
  requestedEnd: Date,
  maximumContinuityGapSeconds = MAXIMUM_CONTINUITY_GAP_SECONDS
): ParameterMetrics {
  const windowStart = requestedStart.getTime();
  const windowEnd = requestedEnd.getTime();

  if (!(windowStart < windowEnd)) {
    throw new Error("Analysis start must be before analysis end");
  }
  if (
    !Number.isFinite(maximumContinuityGapSeconds) ||
    maximumContinuityGapSeconds <= 0
  ) {
    throw new Error("Maximum continuity gap must be greater than zero");
  }

  const sortedScores = scores
    .filter((score) => score.recordedAt.getTime() < windowEnd)
    .sort(
      (left, right) => left.recordedAt.getTime() - right.recordedAt.getTime()
    );
  const maximumGapMilliseconds =
    maximumContinuityGapSeconds * MILLISECONDS_PER_SECOND;
  const windowDurationMilliseconds = windowEnd - windowStart;

  let coveredDurationMilliseconds = 0;
  let unfavorableDurationMilliseconds = 0;
  let weightedScoreTotal = 0;
  const unfavorableIntervals: UnfavorableInterval[] = [];

  for (const [index, normalizedScore] of sortedScores.entries()) {
    const readingTime = normalizedScore.recordedAt.getTime();
    const nextReadingTime = sortedScores[index + 1]?.recordedAt.getTime();

    if (nextReadingTime === readingTime) {
      throw new Error(
        `Duplicate ${normalizedScore.parameterCode} reading timestamp`
      );
    }

    const intervalStart = Math.max(readingTime, windowStart);
    const intervalEnd = Math.min(
      nextReadingTime ?? windowEnd,
      windowEnd,
      readingTime + maximumGapMilliseconds
    );

    if (intervalEnd <= intervalStart) {
      continue;
    }

    const intervalDuration = intervalEnd - intervalStart;
    coveredDurationMilliseconds += intervalDuration;
    weightedScoreTotal += normalizedScore.score * intervalDuration;

    if (normalizedScore.score < CRITICAL_THRESHOLD) {
      unfavorableDurationMilliseconds += intervalDuration;
      appendUnfavorableInterval(
        unfavorableIntervals,
        intervalStart,
        intervalEnd
      );
    }
  }

  if (coveredDurationMilliseconds === 0) {
    throw new Error("Cannot calculate temporal metrics without covered data");
  }

  const weightedMeanScore = weightedScoreTotal / coveredDurationMilliseconds;
  const pLow = unfavorableDurationMilliseconds / coveredDurationMilliseconds;
  const coveredDurationSeconds =
    coveredDurationMilliseconds / MILLISECONDS_PER_SECOND;
  const missingDurationSeconds =
    (windowDurationMilliseconds - coveredDurationMilliseconds) /
    MILLISECONDS_PER_SECOND;

  return {
    coveragePercentage:
      (coveredDurationMilliseconds / windowDurationMilliseconds) * 100,
    coveredDurationSeconds,
    missingDurationSeconds,
    pLow,
    unfavorableDurationSeconds:
      unfavorableDurationMilliseconds / MILLISECONDS_PER_SECOND,
    unfavorableIntervals,
    weightedMeanScore,
  };
}

export function calculateTemporalScore(metrics: ParameterMetrics): number {
  const favorableTimeComponent = 100 - 99 * metrics.pLow;
  return clampScore((metrics.weightedMeanScore + favorableTimeComponent) / 2);
}

export function calculateParameterTemporalScores(
  normalizedByParameter: Record<ParameterCode, NormalizedScore[]>,
  requestedStart: Date,
  requestedEnd: Date,
  maximumContinuityGapSeconds = MAXIMUM_CONTINUITY_GAP_SECONDS
): Record<ParameterCode, ParameterTemporalScore> {
  const temporalScores = {} as Record<ParameterCode, ParameterTemporalScore>;

  for (const parameterCode of SCORING_PARAMETER_CODES) {
    const metrics = calculateTemporalMetrics(
      normalizedByParameter[parameterCode],
      requestedStart,
      requestedEnd,
      maximumContinuityGapSeconds
    );

    temporalScores[parameterCode] = {
      metrics,
      parameterCode,
      temporalScore: calculateTemporalScore(metrics),
    };
  }

  return temporalScores;
}

export function checkDataCoverage(
  parameterTemporalScores: Partial<
    Record<ParameterCode, ParameterTemporalScore>
  >,
  minimumCoveragePercentage = MINIMUM_COVERAGE_PERCENTAGE
): DataCoverageResult {
  const parameterCoverage = {} as DataCoverageResult["parameterCoverage"];
  const missingParameters: ParameterCode[] = [];
  const presentParameters: ParameterCode[] = [];
  let totalCoveragePercentage = 0;

  for (const parameterCode of SCORING_PARAMETER_CODES) {
    const temporalScore = parameterTemporalScores[parameterCode];
    if (!temporalScore) {
      missingParameters.push(parameterCode);
      parameterCoverage[parameterCode] = {
        coveragePercentage: 0,
        coveredDurationSeconds: 0,
        missingDurationSeconds: 0,
      };
      continue;
    }

    const { metrics } = temporalScore;
    presentParameters.push(parameterCode);
    totalCoveragePercentage += metrics.coveragePercentage;
    parameterCoverage[parameterCode] = {
      coveragePercentage: metrics.coveragePercentage,
      coveredDurationSeconds: metrics.coveredDurationSeconds,
      missingDurationSeconds: metrics.missingDurationSeconds,
    };
  }

  const coveragePercentage =
    totalCoveragePercentage / SCORING_PARAMETER_CODES.length;
  const allParametersMeetThreshold = SCORING_PARAMETER_CODES.every(
    (parameterCode) =>
      parameterCoverage[parameterCode].coveragePercentage >=
      minimumCoveragePercentage
  );

  return {
    coveragePercentage,
    hasSufficientCoverage:
      missingParameters.length === 0 && allParametersMeetThreshold,
    minimumRequiredPercentage: minimumCoveragePercentage,
    missingParameters,
    parameterCoverage,
    presentParameters,
  };
}

export function calculatePondScore(
  parameterScores: Record<ParameterCode, number>
): number {
  let finalScore = 0;

  for (const parameterCode of SCORING_PARAMETER_CODES) {
    finalScore +=
      PARAMETER_WEIGHTS[parameterCode] * parameterScores[parameterCode];
  }

  return clampScore(finalScore);
}

export function calculateParameterStats(
  measurements: Array<{ parameterCode: ParameterCode; value: number }>,
  normalizedByParameter: Record<ParameterCode, NormalizedScore[]>,
  parameterTemporalScores: Record<ParameterCode, ParameterTemporalScore>
): Record<ParameterCode, ParameterStats> {
  const parameterStats = {} as Record<ParameterCode, ParameterStats>;

  for (const parameterCode of SCORING_PARAMETER_CODES) {
    const rawValues = measurements
      .filter((measurement) => measurement.parameterCode === parameterCode)
      .map((measurement) => measurement.value);
    const normalizedScores = normalizedByParameter[parameterCode].map(
      (score) => score.score
    );

    parameterStats[parameterCode] = {
      normalizedScores: calculateNormalizedScoreStats(normalizedScores),
      rawValues: calculateRawValueStats(rawValues),
      temporalMetrics: parameterTemporalScores[parameterCode].metrics,
    };
  }

  return parameterStats;
}

export function buildScoreResult(
  pondId: number,
  requestedStartDate: Date,
  requestedEndDate: Date,
  actualStartDate: Date,
  actualEndDate: Date,
  measurements: Array<{ parameterCode: ParameterCode; value: number }>,
  parameterTemporalScores: Record<ParameterCode, ParameterTemporalScore>,
  normalizedByParameter: Record<ParameterCode, NormalizedScore[]>,
  maximumContinuityGapSeconds = MAXIMUM_CONTINUITY_GAP_SECONDS
): ScoreResult {
  const parameterScores: Record<ParameterCode, number> = {
    dissolvedOxygen: parameterTemporalScores.dissolvedOxygen.temporalScore,
    ph: parameterTemporalScores.ph.temporalScore,
    salinity: parameterTemporalScores.salinity.temporalScore,
    temperature: parameterTemporalScores.temperature.temporalScore,
  };
  const dataCoverage = checkDataCoverage(parameterTemporalScores);
  const parameterStats = calculateParameterStats(
    measurements,
    normalizedByParameter,
    parameterTemporalScores
  );
  const measurementsByParameter: Record<ParameterCode, number> = {
    dissolvedOxygen: normalizedByParameter.dissolvedOxygen.length,
    ph: normalizedByParameter.ph.length,
    salinity: normalizedByParameter.salinity.length,
    temperature: normalizedByParameter.temperature.length,
  };

  return {
    aiSummary: null,
    endDate: requestedEndDate,
    finalScore: calculatePondScore(parameterScores),
    metadata: {
      criticalThreshold: CRITICAL_THRESHOLD,
      executionStats: {
        dataCoverage,
        measurementsByParameter,
        timeRange: {
          actualEnd: actualEndDate,
          actualStart: actualStartDate,
          requestedEnd: requestedEndDate,
          requestedStart: requestedStartDate,
        },
        totalMeasurements: measurements.length,
      },
      maximumContinuityGapSeconds,
      minimumCoveragePercentage: MINIMUM_COVERAGE_PERCENTAGE,
      parameterStats,
      parameterWeights: { ...PARAMETER_WEIGHTS },
      scoringModelVersion: SCORING_MODEL_VERSION,
      windowConvention: WINDOW_CONVENTION,
    },
    parameterScores,
    pondId,
    startDate: requestedStartDate,
  };
}
