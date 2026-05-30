import type { ParameterCode } from "@/db";
import type { GaussianConfig, TriangularConfig, NormalizationConfig } from "../types";

// Normalization configurations for each parameter
const PARAMETER_CONFIGS: Record<ParameterCode, { normalization: NormalizationConfig }> = {
  temperature: {
    normalization: {
      type: "gaussian",
      mu: 30,    // optimal temperature in °C
      sigma: 2,  // tolerance
    },
  },
  ph: {
    normalization: {
      type: "gaussian",
      mu: 8.0,  // optimal pH
      sigma: 0.5, // tolerance
    },
  },
  salinity: {
    normalization: {
      type: "gaussian",
      mu: 20,   // optimal salinity in ppt
      sigma: 5,  // tolerance
    },
  },
  dissolved_oxygen: {
    normalization: {
      type: "triangular",
      xopt: 5,   // optimal dissolved oxygen in mg/L
      w: 2,      // tolerance width
    },
  },
  turbidity: {
    normalization: {
      type: "triangular",
      xopt: 50,  // optimal turbidity in NTU
      w: 30,     // tolerance width
    },
  },
};

// Parameter weights for final score calculation
export const PARAMETER_WEIGHTS: Record<ParameterCode, number> = {
  temperature: 0.25,
  ph: 0.20,
  salinity: 0.15,
  dissolved_oxygen: 0.30,
  turbidity: 0.10,
};

// Aggregation weights for temporal aggregation
export const AGGREGATION_WEIGHTS = {
  alpha: 0.50,  // mean score weight
  beta: 0.30,   // minimum score weight
  gamma: 0.20,  // critical time ratio weight
};

// Critical threshold for unfavorable conditions
export const CRITICAL_THRESHOLD = 40;

/**
 * Gaussian normalization function
 * S(x) = 1 + 99 * e^(-(x-μ)² / (2σ²))
 */
export function gaussianNormalize(x: number, mu: number, sigma: number): number {
  const exponent = -Math.pow(x - mu, 2) / (2 * Math.pow(sigma, 2));
  const score = 1 + 99 * Math.exp(exponent);
  // Clamp to [1, 100] range
  return Math.max(1, Math.min(100, score));
}

/**
 * Triangular normalization function
 * S(x) = 1 + 99 * max(0, 1 - |x-x_opt|/w)
 */
export function triangularNormalize(x: number, xopt: number, w: number): number {
  const distance = Math.abs(x - xopt);
  const ratio = Math.max(0, 1 - distance / w);
  const score = 1 + 99 * ratio;
  // Clamp to [1, 100] range
  return Math.max(1, Math.min(100, score));
}

/**
 * Normalize a parameter value based on its configuration
 */
export function normalizeParameter(parameterCode: ParameterCode, value: number): number {
  const config = PARAMETER_CONFIGS[parameterCode];
  
  if (!config) {
    throw new Error(`Unknown parameter code: ${parameterCode}`);
  }
  
  const normalization = config.normalization;
  
  if (normalization.type === "gaussian") {
    return gaussianNormalize(value, normalization.mu, normalization.sigma);
  } else if (normalization.type === "triangular") {
    return triangularNormalize(value, normalization.xopt, normalization.w);
  }
  
  throw new Error(`Unknown normalization type: ${(normalization as any).type}`);
}

/**
 * Get the normalization configuration for a parameter
 */
export function getNormalizationConfig(parameterCode: ParameterCode): NormalizationConfig {
  const config = PARAMETER_CONFIGS[parameterCode];
  if (!config) {
    throw new Error(`Unknown parameter code: ${parameterCode}`);
  }
  return config.normalization;
}

/**
 * Get parameter weight for final score calculation
 */
export function getParameterWeight(parameterCode: ParameterCode): number {
  return PARAMETER_WEIGHTS[parameterCode];
}

export { PARAMETER_CONFIGS };
