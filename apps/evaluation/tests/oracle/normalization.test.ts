import { describe, expect, test } from "bun:test";
import {
  gaussianScore,
  normalizeMeasurement,
  symmetricTriangleScore,
} from "../../src/oracle/normalization.ts";
import { loadModelConfig } from "../../src/shared/config.ts";
import { PARAMETER_CODES } from "../../src/shared/types.ts";

const model = await loadModelConfig();
const SCORE_TOLERANCE = 0.01;

const expectClose = (actual: number, expected: number): void => {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(SCORE_TOLERANCE);
};

describe("Gaussian normalization", () => {
  test("returns 100 at every Gaussian center", () => {
    expect(normalizeMeasurement("temperature", 30, model)).toBe(100);
    expect(normalizeMeasurement("ph", 8, model)).toBe(100);
    expect(normalizeMeasurement("salinity", 20, model)).toBe(100);
  });

  test("matches the tracked examples", () => {
    expectClose(normalizeMeasurement("temperature", 29, model), 94.65);
    expectClose(normalizeMeasurement("temperature", 28, model), 80.27);
    expectClose(normalizeMeasurement("temperature", 26, model), 41.7);
    expectClose(normalizeMeasurement("temperature", 24, model), 14.4);
  });

  test("is symmetric and monotonically decreases with distance", () => {
    for (const parameterCode of ["temperature", "ph", "salinity"] as const) {
      const normalization = model.normalization[parameterCode];
      if (normalization.kind !== "gaussian") {
        throw new Error(`${parameterCode} must use Gaussian normalization`);
      }
      let previousScore = 100;
      let distanceMultiplier = 0.1;
      while (distanceMultiplier <= 10) {
        const distance = distanceMultiplier * normalization.sigma;
        const lower = normalizeMeasurement(
          parameterCode,
          normalization.mu - distance,
          model
        );
        const upper = normalizeMeasurement(
          parameterCode,
          normalization.mu + distance,
          model
        );
        expect(lower).toBeCloseTo(upper, 12);
        expect(lower).toBeLessThanOrEqual(previousScore);
        previousScore = lower;
        distanceMultiplier += 0.1;
      }
    }
  });

  test("stays finite and within range for broad finite inputs", () => {
    const inputs = [
      -Number.MAX_VALUE,
      -1_000_000,
      -100,
      0,
      100,
      1_000_000,
      Number.MAX_VALUE,
    ];
    for (const input of inputs) {
      for (const parameterCode of PARAMETER_CODES) {
        const score = normalizeMeasurement(parameterCode, input, model);
        expect(Number.isFinite(score)).toBe(true);
        expect(score).toBeGreaterThanOrEqual(model.scoreRange.minimum);
        expect(score).toBeLessThanOrEqual(model.scoreRange.maximum);
      }
    }
  });

  test("rejects nonfinite inputs and invalid sigma", () => {
    expect(() =>
      normalizeMeasurement("temperature", Number.NaN, model)
    ).toThrow();
    expect(() =>
      gaussianScore(
        30,
        { kind: "gaussian", mu: 30, sigma: 0 },
        model.scoreRange
      )
    ).toThrow();
    expect(() =>
      gaussianScore(
        Number.POSITIVE_INFINITY,
        { kind: "gaussian", mu: 30, sigma: 3 },
        model.scoreRange
      )
    ).toThrow();
  });
});

describe("symmetric dissolved-oxygen normalization", () => {
  test("matches the authoritative triangle values", () => {
    const expectedScores = new Map([
      [3, 1],
      [4, 50.5],
      [5, 100],
      [6, 50.5],
      [7, 1],
    ]);
    for (const [value, expectedScore] of expectedScores) {
      expect(normalizeMeasurement("dissolvedOxygen", value, model)).toBe(
        expectedScore
      );
    }
  });

  test("is symmetric even though high-oxygen penalization is a limitation", () => {
    expect(normalizeMeasurement("dissolvedOxygen", 4.25, model)).toBe(
      normalizeMeasurement("dissolvedOxygen", 5.75, model)
    );
  });

  test("rejects invalid triangle configuration", () => {
    expect(() =>
      symmetricTriangleScore(
        5,
        { halfWidth: 0, kind: "symmetricTriangle", reference: 5 },
        model.scoreRange
      )
    ).toThrow();
  });
});
