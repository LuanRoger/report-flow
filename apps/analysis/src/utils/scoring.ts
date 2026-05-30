import type { ParameterCode } from "../../db";
import type { NormalizedScore, ParameterMetrics, ParameterTemporalScore, PondScoreResult } from "../types";
import {
  normalizeParameter,
  getParameterWeight,
  AGGREGATION_WEIGHTS,
  CRITICAL_THRESHOLD,
  PARAMETER_WEIGHTS,
} from "./normalization";

/**
 * Calculate raw value statistics for a parameter
 */
export function calculateRawValueStats(values: number[]): {
  min: number | null;
  max: number | null;
  mean: number | null;
  count: number;
} {
  if (values.length === 0) {
    return { min: null, max: null, mean: null, count: 0 };
  }

  return {
    min: Math.min(...values),
    max: Math.max(...values),
    mean: values.reduce((sum, val) => sum + val, 0) / values.length,
    count: values.length,
  };
}

/**
 * Calculate normalized score statistics for a parameter
 */
export function calculateNormalizedScoreStats(scores: number[]): {
  min: number | null;
  max: number | null;
  mean: number | null;
  count: number;
} {
  if (scores.length === 0) {
    return { min: null, max: null, mean: null, count: 0 };
  }

  return {
    min: Math.min(...scores),
    max: Math.max(...scores),
    mean: scores.reduce((sum, val) => sum + val, 0) / scores.length,
    count: scores.length,
  };
}

/**
 * Calculate temporal metrics for a parameter from normalized scores
 */
export function calculateTemporalMetrics(scores: number[]): ParameterMetrics {
  if (scores.length === 0) {
    throw new Error("Cannot calculate metrics from empty scores array");
  }

  // Calculate mean score
  const meanScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;

  // Calculate minimum score
  const minScore = Math.min(...scores);

  // Calculate critical time ratio (fraction of time score < threshold)
  const criticalCount = scores.filter(score => score < CRITICAL_THRESHOLD).length;
  const criticalTimeRatio = criticalCount / scores.length;

  return {
    meanScore,
    minScore,
    criticalTimeRatio,
    criticalCount,
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
 * Normalize raw measurements and group by parameter
 */
export function normalizeMeasurements(
  measurements: Array<{ parameterCode: ParameterCode; value: number; recordedAt: Date }>
): Record<ParameterCode, NormalizedScore[]> {
  const normalizedByParameter: Record<ParameterCode, NormalizedScore[]> = {
    temperature: [],
    ph: [],
    salinity: [],
    dissolved_oxygen: [],
    turbidity: [],
  };

  for (const measurement of measurements) {
    const normalizedScore: NormalizedScore = {
      parameterCode: measurement.parameterCode,
      score: normalizeParameter(measurement.parameterCode, measurement.value),
      recordedAt: measurement.recordedAt,
    };
    normalizedByParameter[measurement.parameterCode].push(normalizedScore);
  }

  return normalizedByParameter;
}

/**
 * Calculate comprehensive parameter statistics including raw values and normalized scores
 */
export function calculateParameterStats(
  measurements: Array<{ parameterCode: ParameterCode; value: number }>,
  normalizedByParameter: Record<ParameterCode, NormalizedScore[]>
): Record<string, {
  rawValues: { min: number | null; max: number | null; mean: number | null; count: number };
  normalizedScores: { min: number | null; max: number | null; mean: number | null; count: number };
  temporalMetrics: ParameterMetrics;
}> {
  const parameterStats: Record<string, any> = {};

  for (const parameterCode of Object.keys(normalizedByParameter) as ParameterCode[]) {
    // Get raw values for this parameter
    const rawValues = measurements
      .filter(m => m.parameterCode === parameterCode)
      .map(m => m.value);

    // Get normalized scores for this parameter
    const normalizedScores = normalizedByParameter[parameterCode].map(n => n.score);

    // Calculate raw value stats
    const rawStats = calculateRawValueStats(rawValues);

    // Calculate normalized score stats
    const normalizedStats = calculateNormalizedScoreStats(normalizedScores);

    // Calculate temporal metrics
    const temporalMetrics = normalizedScores.length > 0 
      ? calculateTemporalMetrics(normalizedScores)
      : { meanScore: 1, minScore: 1, criticalTimeRatio: 0, criticalCount: 0 };

    parameterStats[parameterCode] = {
      rawValues: rawStats,
      normalizedScores: normalizedStats,
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
  const temporalScores: Record<ParameterCode, ParameterTemporalScore> = {} as any;

  for (const [parameterCode, scores] of Object.entries(normalizedByParameter)) {
    if (scores.length === 0) {
      // If no data for this parameter, use minimum score
      temporalScores[parameterCode as ParameterCode] = {
        parameterCode: parameterCode as ParameterCode,
        temporalScore: 1,
      };
      continue;
    }

    const metrics = calculateTemporalMetrics(scores.map(s => s.score));
    const temporalScore = calculateTemporalScore(metrics);

    temporalScores[parameterCode as ParameterCode] = {
      parameterCode: parameterCode as ParameterCode,
      temporalScore,
    };
  }

  return temporalScores;
}

/**
 * Build the complete pond score result with enhanced metadata
 */
export function buildPondScoreResult(
  pondId: string,
  requestedStartDate: Date,
  requestedEndDate: Date,
  actualStartDate: Date | null,
  actualEndDate: Date | null,
  measurements: Array<{ parameterCode: ParameterCode; value: number }>,
  parameterTemporalScores: Record<ParameterCode, ParameterTemporalScore>,
  normalizedByParameter: Record<ParameterCode, NormalizedScore[]>,
  hasSufficientCoverage: boolean,
  coveragePercentage: number,
  requiredParameters: ParameterCode[],
  presentParameters: ParameterCode[]
): PondScoreResult {
  const parameterStats = calculateParameterStats(measurements, normalizedByParameter);

  const parameterScores: Record<string, number> = {
    temperature: 1,
    ph: 1,
    salinity: 1,
    dissolvedOxygen: 1,
    turbidity: 1,
  };

  // Extract scores from temporal scores
  for (const [parameterCode, temporalScore] of Object.entries(parameterTemporalScores)) {
    const paramKey = parameterCode === "dissolved_oxygen" ? "dissolvedOxygen" : parameterCode;
    parameterScores[paramKey] = temporalScore.temporalScore;
  }

  const finalScore = calculatePondScore({
    temperature: parameterScores.temperature,
    ph: parameterScores.ph,
    salinity: parameterScores.salinity,
    dissolved_oxygen: parameterScores.dissolvedOxygen,
    turbidity: parameterScores.turbidity,
  });

  // Count measurements by parameter
  const measurementsByParameter: Record<string, number> = {};
  for (const param of Object.keys(normalizedByParameter)) {
    measurementsByParameter[param] = normalizedByParameter[param as ParameterCode].length;
  }

  return {
    pondId,
    startDate: requestedStartDate.toISOString(),
    endDate: requestedEndDate.toISOString(),
    finalScore,
    parameterScores: {
      temperature: parameterScores.temperature,
      ph: parameterScores.ph,
      salinity: parameterScores.salinity,
      dissolvedOxygen: parameterScores.dissolvedOxygen,
      turbidity: parameterScores.turbidity,
    },
    metadata: {
      criticalThreshold: CRITICAL_THRESHOLD,
      aggregationWeights: { ...AGGREGATION_WEIGHTS },
      parameterWeights: { ...PARAMETER_WEIGHTS },
      executionStats: {
        totalMeasurements: measurements.length,
        measurementsByParameter,
        dataCoverage: {
          requiredParameters: requiredParameters.map(p => p),
          presentParameters: presentParameters.map(p => p),
          coveragePercentage,
          hasSufficientCoverage,
        },
        timeRange: {
          requestedStart: requestedStartDate.toISOString(),
          requestedEnd: requestedEndDate.toISOString(),
          actualStart: actualStartDate?.toISOString() || null,
          actualEnd: actualEndDate?.toISOString() || null,
        },
      },
      parameterStats,
    },
  };
}

/**
 * Check if there's sufficient data coverage
 * Returns true if at least 70% of expected measurements are present
 */
export function checkDataCoverage(
  measurements: Array<{ parameterCode: ParameterCode }>,
  expectedParameters: ParameterCode[] = ["temperature", "ph", "salinity", "dissolved_oxygen", "turbidity"]
): { hasSufficientCoverage: boolean; coveragePercentage: number; presentParameters: ParameterCode[] } {
  const presentParameters = new Set(measurements.map(m => m.parameterCode));
  const coverage = presentParameters.size / expectedParameters.length;
  const coveragePercentage = Math.round(coverage * 100);
  const hasSufficientCoverage = coverage >= 0.7; // At least 70% coverage

  return {
    hasSufficientCoverage,
    coveragePercentage,
    presentParameters: Array.from(presentParameters) as ParameterCode[],
  };
}
