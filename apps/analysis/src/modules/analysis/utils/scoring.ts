import type { ParameterCode } from "database";
import type { ScoreResult } from "../schemas/types";
import type {
  NormalizedScore,
  ParameterMetrics,
  ParameterStats,
  ParameterTemporalScore,
} from "../types/analysis";
import {
  AGGREGATION_WEIGHTS,
  CRITICAL_THRESHOLD,
  getParameterWeight,
  PARAMETER_WEIGHTS,
} from "./normalization";

export function checkDataCoverage(
  measurements: Array<{ parameterCode: ParameterCode }>,
  expectedParameters: ParameterCode[] = [
    "temperature",
    "ph",
    "salinity",
    "dissolvedOxygen",
    "turbidity",
  ]
): {
  hasSufficientCoverage: boolean;
  coveragePercentage: number;
  presentParameters: ParameterCode[];
} {
  const presentParameters = new Set(measurements.map((m) => m.parameterCode));
  const coverage = presentParameters.size / expectedParameters.length;
  const coveragePercentage = Math.round(coverage * 100);
  const hasSufficientCoverage = coverage >= 0.7; // At least 70% coverage

  return {
    coveragePercentage,
    hasSufficientCoverage,
    presentParameters: Array.from(presentParameters) as ParameterCode[],
  };
}

export function calculateRawValueStats(values: number[]): {
  min: number | null;
  max: number | null;
  mean: number | null;
  count: number;
} {
  if (values.length === 0) {
    return { count: 0, max: null, mean: null, min: null };
  }

  return {
    count: values.length,
    max: Math.max(...values),
    mean: values.reduce((sum, val) => sum + val, 0) / values.length,
    min: Math.min(...values),
  };
}

export function calculateNormalizedScoreStats(scores: number[]): {
  min: number | null;
  max: number | null;
  mean: number | null;
  count: number;
} {
  if (scores.length === 0) {
    return { count: 0, max: null, mean: null, min: null };
  }

  return {
    count: scores.length,
    max: Math.max(...scores),
    mean: scores.reduce((sum, val) => sum + val, 0) / scores.length,
    min: Math.min(...scores),
  };
}

export function calculateTemporalMetrics(scores: number[]): ParameterMetrics {
  if (scores.length === 0) {
    throw new Error("Cannot calculate metrics from empty scores array");
  }

  const meanScore =
    scores.reduce((sum, score) => sum + score, 0) / scores.length;

  const minScore = Math.min(...scores);

  const criticalCount = scores.filter(
    (score) => score < CRITICAL_THRESHOLD
  ).length;
  const criticalTimeRatio = criticalCount / scores.length;

  return {
    criticalCount,
    criticalTimeRatio,
    meanScore,
    minScore,
  };
}

/**
 * Calculate temporal aggregation score for a parameter
 * Ŝ_i = α * mean(S_i) + β * min(S_i) + γ * (100 - P_low,i * 100)
 */
export function calculateTemporalScore(metrics: ParameterMetrics): number {
  const { alpha, beta, gamma } = AGGREGATION_WEIGHTS;

  const meanComponent = alpha * metrics.meanScore;
  const minComponent = beta * metrics.minScore;
  const criticalComponent = gamma * (100 - metrics.criticalTimeRatio * 100);

  const temporalScore = meanComponent + minComponent + criticalComponent;

  // Clamp to [1, 100] range
  return Math.max(1, Math.min(100, temporalScore));
}

/**
 * Calculate the final pond score from parameter temporal scores
 */
export function calculatePondScore(
  parameterScores: Record<ParameterCode, number>
): number {
  let finalScore = 0;

  for (const [parameterCode, score] of Object.entries(parameterScores)) {
    const weight = getParameterWeight(parameterCode as ParameterCode);
    finalScore += weight * score;
  }

  // Clamp to [1, 100] range
  return Math.max(1, Math.min(100, finalScore));
}

/**
 * Calculate comprehensive parameter statistics including raw values and normalized scores
 */
export function calculateParameterStats(
  measurements: Array<{ parameterCode: ParameterCode; value: number }>,
  normalizedByParameter: Record<ParameterCode, NormalizedScore[]>
): Record<string, ParameterStats> {
  const parameterStats: Record<ParameterCode, ParameterStats> = {} as Record<
    ParameterCode,
    ParameterStats
  >;

  for (const parameterCode of Object.keys(
    normalizedByParameter
  ) as ParameterCode[]) {
    // Get raw values for this parameter
    const rawValues = measurements
      .filter((m) => m.parameterCode === parameterCode)
      .map((m) => m.value);

    // Get normalized scores for this parameter
    const normalizedScores = normalizedByParameter[parameterCode].map(
      (n) => n.score
    );

    // Calculate raw value stats
    const rawStats = calculateRawValueStats(rawValues);

    // Calculate normalized score stats
    const normalizedStats = calculateNormalizedScoreStats(normalizedScores);

    // Calculate temporal metrics
    const temporalMetrics =
      normalizedScores.length > 0
        ? calculateTemporalMetrics(normalizedScores)
        : { criticalCount: 0, criticalTimeRatio: 0, meanScore: 1, minScore: 1 };

    parameterStats[parameterCode] = {
      normalizedScores: normalizedStats,
      rawValues: rawStats,
      temporalMetrics,
    };
  }

  return parameterStats;
}

/**
 * Calculate parameter temporal scores from normalized measurements
 */
export function calculateParameterTemporalScores(
  normalizedByParameter: Record<ParameterCode, NormalizedScore[]>
): Record<ParameterCode, ParameterTemporalScore> {
  const temporalScores: Record<ParameterCode, ParameterTemporalScore> =
    {} as Record<ParameterCode, ParameterTemporalScore>;

  for (const [parameterCode, scores] of Object.entries(normalizedByParameter)) {
    if (scores.length === 0) {
      // If no data for this parameter, use minimum score
      temporalScores[parameterCode as ParameterCode] = {
        parameterCode: parameterCode as ParameterCode,
        temporalScore: 1,
      };
      continue;
    }

    const metrics = calculateTemporalMetrics(scores.map((s) => s.score));
    const temporalScore = calculateTemporalScore(metrics);

    temporalScores[parameterCode as ParameterCode] = {
      parameterCode: parameterCode as ParameterCode,
      temporalScore,
    };
  }

  return temporalScores;
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
  hasSufficientCoverage: boolean,
  coveragePercentage: number,
  presentParameters: ParameterCode[]
): ScoreResult {
  const parameterStats = calculateParameterStats(
    measurements,
    normalizedByParameter
  );

  const parameterScores: Record<ParameterCode, number> = {
    dissolvedOxygen: 1,
    ph: 1,
    salinity: 1,
    temperature: 1,
    turbidity: 1,
  };

  for (const [parameterCode, temporalScore] of Object.entries(
    parameterTemporalScores
  )) {
    parameterScores[parameterCode as ParameterCode] =
      temporalScore.temporalScore;
  }

  const finalScore = calculatePondScore({
    ...parameterScores,
  });

  const measurementsByParameter: Record<string, number> = {};
  for (const parameter of Object.keys(normalizedByParameter)) {
    measurementsByParameter[parameter] =
      normalizedByParameter[parameter as ParameterCode].length;
  }

  return {
    endDate: requestedEndDate,
    finalScore,
    metadata: {
      aggregationWeights: { ...AGGREGATION_WEIGHTS },
      criticalThreshold: CRITICAL_THRESHOLD,
      executionStats: {
        dataCoverage: {
          coveragePercentage,
          hasSufficientCoverage,
          presentParameters: presentParameters.map((p) => p),
        },
        measurementsByParameter,
        timeRange: {
          actualEnd: actualEndDate,
          actualStart: actualStartDate,
          requestedEnd: requestedEndDate,
          requestedStart: requestedStartDate,
        },
        totalMeasurements: measurements.length,
      },
      parameterStats,
      parameterWeights: { ...PARAMETER_WEIGHTS },
    },
    parameterScores,
    pondId,
    startDate: requestedStartDate,
  };
}
