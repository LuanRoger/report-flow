import type { ParameterCode } from "../../db";

export interface PondScoreResult {
  pondId: string;
  startDate: string;
  endDate: string;
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
    executionStats: {
      totalMeasurements: number;
      measurementsByParameter: Record<string, number>;
      dataCoverage: {
        requiredParameters: string[];
        presentParameters: string[];
        coveragePercentage: number;
        hasSufficientCoverage: boolean;
      };
      timeRange: {
        requestedStart: string;
        requestedEnd: string;
        actualStart: string | null;
        actualEnd: string | null;
      };
    };
    parameterStats: Record<string, {
      rawValues: {
        min: number | null;
        max: number | null;
        mean: number | null;
        count: number;
      };
      normalizedScores: {
        min: number | null;
        max: number | null;
        mean: number | null;
        count: number;
      };
      temporalMetrics: {
        meanScore: number;
        minScore: number;
        criticalTimeRatio: number;
        criticalCount: number;
      };
    }>;
  };
}

export interface AnalysisQueryParams {
  pondId: string;
  startDate?: string;
  endDate?: string;
  window?: string;
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
  criticalCount: number;
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
