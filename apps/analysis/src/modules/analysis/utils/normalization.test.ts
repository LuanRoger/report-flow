import { describe, expect, test } from "bun:test";
import {
  gaussianNormalize,
  normalizeParameter,
  PARAMETER_CONFIGS,
  PARAMETER_WEIGHTS,
} from "./normalization";

describe("Gaussian normalization", () => {
  test("uses the TCC centers and sigmas", () => {
    expect(PARAMETER_CONFIGS.temperature.normalization).toEqual({
      mu: 30,
      sigma: 3,
      type: "gaussian",
    });
    expect(PARAMETER_CONFIGS.ph.normalization).toEqual({
      mu: 8,
      sigma: 0.75,
      type: "gaussian",
    });
    expect(PARAMETER_CONFIGS.salinity.normalization).toEqual({
      mu: 20,
      sigma: 7.5,
      type: "gaussian",
    });
  });

  test("matches the expected temperature examples", () => {
    expect(normalizeParameter("temperature", 30)).toBeCloseTo(100, 8);
    expect(normalizeParameter("temperature", 29)).toBeCloseTo(94.65, 2);
    expect(normalizeParameter("temperature", 28)).toBeCloseTo(80.27, 2);
    expect(normalizeParameter("temperature", 26)).toBeCloseTo(41.7, 2);
    expect(normalizeParameter("temperature", 24)).toBeCloseTo(14.4, 2);
  });

  test("is symmetric and bounded", () => {
    expect(normalizeParameter("ph", 7.5)).toBeCloseTo(
      normalizeParameter("ph", 8.5),
      8
    );
    expect(normalizeParameter("salinity", -1000)).toBeGreaterThanOrEqual(1);
    expect(normalizeParameter("salinity", 1000)).toBeLessThanOrEqual(100);
  });

  test("rejects nonfinite inputs and invalid sigma", () => {
    expect(() => gaussianNormalize(Number.NaN, 30, 3)).toThrow();
    expect(() => gaussianNormalize(30, 30, 0)).toThrow();
  });
});

describe("Dissolved-oxygen normalization", () => {
  test("uses the symmetric TCC triangle", () => {
    expect(normalizeParameter("dissolvedOxygen", 5)).toBe(100);
    expect(normalizeParameter("dissolvedOxygen", 4)).toBe(50.5);
    expect(normalizeParameter("dissolvedOxygen", 3)).toBe(1);
    expect(normalizeParameter("dissolvedOxygen", 2)).toBe(1);
    expect(normalizeParameter("dissolvedOxygen", 6)).toBe(50.5);
    expect(normalizeParameter("dissolvedOxygen", 7)).toBe(1);
  });
});

describe("Parameter weights", () => {
  test("match the TCC model and sum to one", () => {
    expect(PARAMETER_WEIGHTS).toEqual({
      dissolvedOxygen: 0.33,
      ph: 0.22,
      salinity: 0.17,
      temperature: 0.28,
    });

    const weightSum = Object.values(PARAMETER_WEIGHTS).reduce(
      (sum, weight) => sum + weight,
      0
    );
    expect(weightSum).toBeCloseTo(1, 12);
  });
});
