import type { ParameterCode } from "database";

export type AnalysisTimeWindow = "7d" | "30d" | "90d" | "custom";

export interface AnalysisQueryParams {
  endDate?: string;
  generateAiSummary?: boolean;
  pondId: string;
  startDate?: string;
  window?: string;
}

export interface MeasurementData {
  parameterCode: ParameterCode;
  pondId: string;
  recordedAt: Date;
  value: number;
}

export interface NormalizedScore {
  parameterCode: ParameterCode;
  recordedAt: Date;
  score: number;
}

export interface UnfavorableInterval {
  durationSeconds: number;
  end: Date;
  start: Date;
}

export interface ParameterMetrics {
  coveragePercentage: number;
  coveredDurationSeconds: number;
  missingDurationSeconds: number;
  pLow: number;
  unfavorableDurationSeconds: number;
  unfavorableIntervals: UnfavorableInterval[];
  weightedMeanScore: number;
}

export interface ParameterStats {
  normalizedScores: {
    count: number;
    max: number | null;
    mean: number | null;
    min: number | null;
  };
  rawValues: {
    count: number;
    max: number | null;
    mean: number | null;
    min: number | null;
  };
  temporalMetrics: ParameterMetrics;
}

export interface ParameterTemporalScore {
  metrics: ParameterMetrics;
  parameterCode: ParameterCode;
  temporalScore: number;
}

export interface GaussianConfig {
  mu: number;
  sigma: number;
  type: "gaussian";
}

export interface TriangularConfig {
  type: "triangular";
  w: number;
  xopt: number;
}

export type NormalizationConfig = GaussianConfig | TriangularConfig;
