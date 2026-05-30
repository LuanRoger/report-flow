import type { ParameterCode } from "@/db";

export interface PondScoreResult {
  pondId: string;
  startDate: Date;
  endDate: Date;
  finalScore: number;
  parameterScores: {
    temperature: number;
    ph: number;
    salinity: number;
    dissolvedOxygen: number;
    turbidity: number;
  };
  metadata: {
    criticalThreshold: number;
    aggregationWeights: {
      alpha: number;
      beta: number;
      gamma: number;
    };
    parameterWeights: {
      temperature: number;
      ph: number;
      salinity: number;
      dissolvedOxygen: number;
      turbidity: number;
    };
  };
}

export interface AnalysisQueryParams {
  pondId: string;
  startDate: Date;
  endDate: Date;
}

export interface MeasurementData {
  pondId: string;
  parameterCode: ParameterCode;
  value: number;
  recordedAt: Date;
}

export interface NormalizedScore {
  parameterCode: ParameterCode;
  score: number;
  recordedAt: Date;
}

export interface ParameterMetrics {
  meanScore: number;
  minScore: number;
  criticalTimeRatio: number;
}

export interface ParameterTemporalScore {
  parameterCode: ParameterCode;
  temporalScore: number;
}

// Normalization configuration types
export interface GaussianConfig {
  type: "gaussian";
  mu: number;
  sigma: number;
}

export interface TriangularConfig {
  type: "triangular";
  xopt: number;
  w: number;
}

export type NormalizationConfig = GaussianConfig | TriangularConfig;

export interface ParameterConfig {
  normalization: NormalizationConfig;
  weight: number;
}
