import type { ParameterCode } from "database";
import type { NormalizationConfig, NormalizedScore } from "../types/analysis";

export const SCORING_PARAMETER_CODES = [
  "dissolvedOxygen",
  "temperature",
  "ph",
  "salinity",
] as const satisfies readonly ParameterCode[];

export const PARAMETER_CONFIGS = {
  dissolvedOxygen: {
    normalization: {
      type: "triangular",
      w: 2,
      xopt: 5,
    },
  },
  ph: {
    normalization: {
      mu: 8,
      sigma: 0.75,
      type: "gaussian",
    },
  },
  salinity: {
    normalization: {
      mu: 20,
      sigma: 7.5,
      type: "gaussian",
    },
  },
  temperature: {
    normalization: {
      mu: 30,
      sigma: 3,
      type: "gaussian",
    },
  },
} satisfies Record<ParameterCode, { normalization: NormalizationConfig }>;

export const PARAMETER_WEIGHTS = {
  dissolvedOxygen: 0.33,
  ph: 0.22,
  salinity: 0.17,
  temperature: 0.28,
} as const satisfies Record<ParameterCode, number>;

export const CRITICAL_THRESHOLD = 50;
export const EXPECTED_COLLECTION_INTERVAL_SECONDS = 10;
export const MAXIMUM_CONTINUITY_GAP_SECONDS = 20;
export const MINIMUM_COVERAGE_PERCENTAGE = 70;
export const SCORING_MODEL_VERSION = "tcc-symmetric-oxygen-v1";
export const WINDOW_CONVENTION = "[start,end)";

export function gaussianNormalize(
  value: number,
  mu: number,
  sigma: number
): number {
  if (!(Number.isFinite(value) && Number.isFinite(mu) && sigma > 0)) {
    throw new Error(
      "Gaussian normalization requires finite values and sigma > 0"
    );
  }

  const exponent = -((value - mu) ** 2) / (2 * sigma ** 2);
  const score = 1 + 99 * Math.exp(exponent);

  return Math.max(1, Math.min(100, score));
}

export function triangularNormalize(
  value: number,
  optimum: number,
  width: number
): number {
  if (!(Number.isFinite(value) && Number.isFinite(optimum) && width > 0)) {
    throw new Error(
      "Triangular normalization requires finite values and width > 0"
    );
  }

  const distance = Math.abs(value - optimum);
  const ratio = Math.max(0, 1 - distance / width);
  const score = 1 + 99 * ratio;

  return Math.max(1, Math.min(100, score));
}

export function normalizeParameter(
  parameterCode: ParameterCode,
  value: number
): number {
  const { normalization } = PARAMETER_CONFIGS[parameterCode];

  if (normalization.type === "gaussian") {
    return gaussianNormalize(value, normalization.mu, normalization.sigma);
  }

  return triangularNormalize(value, normalization.xopt, normalization.w);
}

export function normalizeMeasurements(
  measurements: Array<{
    parameterCode: ParameterCode;
    recordedAt: Date;
    value: number;
  }>
): Record<ParameterCode, NormalizedScore[]> {
  const normalizedByParameter: Record<ParameterCode, NormalizedScore[]> = {
    dissolvedOxygen: [],
    ph: [],
    salinity: [],
    temperature: [],
  };

  for (const measurement of measurements) {
    normalizedByParameter[measurement.parameterCode].push({
      parameterCode: measurement.parameterCode,
      recordedAt: measurement.recordedAt,
      score: normalizeParameter(measurement.parameterCode, measurement.value),
    });
  }

  return normalizedByParameter;
}

export function getNormalizationConfig(
  parameterCode: ParameterCode
): NormalizationConfig {
  return PARAMETER_CONFIGS[parameterCode].normalization;
}

export function getParameterWeight(parameterCode: ParameterCode): number {
  return PARAMETER_WEIGHTS[parameterCode];
}
