import type { ParameterCode } from "database";

export type AnalysisTimeWindow = "7d" | "30d" | "90d" | "custom";

export interface AnalysisQueryParams {
  endDate?: string;
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

export interface ParameterStats {
  normalizedScores: {
    min: number | null;
    max: number | null;
    mean: number | null;
    count: number;
  };
  rawValues: {
    min: number | null;
    max: number | null;
    mean: number | null;
    count: number;
  };
  temporalMetrics: ParameterMetrics;
}

export interface ParameterMetrics {
  criticalCount: number;
  criticalTimeRatio: number;
  meanScore: number;
  minScore: number;
}

export interface ParameterTemporalScore {
  parameterCode: ParameterCode;
  temporalScore: number;
}

// Normalization configuration types
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

export interface ParameterConfig {
  normalization: NormalizationConfig;
  weight: number;
}
