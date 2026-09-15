import type {
  GaussianNormalizationConfig,
  ModelConfig,
  ParameterCode,
  TriangleNormalizationConfig,
} from "../shared/types.ts";

export interface ScoreRange {
  maximum: number;
  minimum: number;
}

const validateFinite = (value: number, label: string): void => {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite`);
  }
};

const validateScoreRange = (range: ScoreRange): number => {
  validateFinite(range.minimum, "score range minimum");
  validateFinite(range.maximum, "score range maximum");
  const span = range.maximum - range.minimum;
  if (span <= 0) {
    throw new Error("score range maximum must exceed its minimum");
  }
  return span;
};

const clampToRange = (score: number, range: ScoreRange): number =>
  Math.min(range.maximum, Math.max(range.minimum, score));

export const gaussianScore = (
  value: number,
  config: GaussianNormalizationConfig,
  range: ScoreRange
): number => {
  validateFinite(value, "Gaussian input");
  validateFinite(config.mu, "Gaussian mu");
  validateFinite(config.sigma, "Gaussian sigma");
  if (config.sigma <= 0) {
    throw new Error("Gaussian sigma must be positive");
  }

  const span = validateScoreRange(range);
  const standardizedDistance = (value - config.mu) / config.sigma;
  const exponent = -(standardizedDistance * standardizedDistance) / 2;
  const score = range.minimum + span * Math.exp(exponent);
  return clampToRange(score, range);
};

export const symmetricTriangleScore = (
  value: number,
  config: TriangleNormalizationConfig,
  range: ScoreRange
): number => {
  validateFinite(value, "Triangle input");
  validateFinite(config.reference, "Triangle reference");
  validateFinite(config.halfWidth, "Triangle half-width");
  if (config.halfWidth <= 0) {
    throw new Error("Triangle half-width must be positive");
  }

  const span = validateScoreRange(range);
  const triangularFraction = Math.max(
    0,
    1 - Math.abs(value - config.reference) / config.halfWidth
  );
  return clampToRange(range.minimum + span * triangularFraction, range);
};

export const normalizeMeasurement = (
  parameterCode: ParameterCode,
  value: number,
  model: ModelConfig
): number => {
  const normalization = model.normalization[parameterCode];
  if (normalization.kind === "gaussian") {
    return gaussianScore(value, normalization, model.scoreRange);
  }
  return symmetricTriangleScore(value, normalization, model.scoreRange);
};
