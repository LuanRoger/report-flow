import { describe, expect, test } from "bun:test";
import {
  percentile,
  summarizeDistribution,
} from "../../src/runtime/statistics.ts";

describe("distribution statistics", () => {
  test("uses recorded linear interpolation", () => {
    const samples = [1, 2, 3, 4, 5];
    expect(percentile(samples, 0.5)).toBe(3);
    expect(percentile(samples, 0.95)).toBeCloseTo(4.8, 12);

    expect(summarizeDistribution([5, 1, 3, 2, 4])).toMatchObject({
      count: 5,
      maximum: 5,
      mean: 3,
      median: 3,
      minimum: 1,
      p95: 4.8,
      percentileMethod: "linear-interpolation-r7",
    });
  });

  test("rejects empty and nonfinite samples", () => {
    expect(() => summarizeDistribution([])).toThrow("At least one sample");
    expect(() => summarizeDistribution([1, Number.NaN])).toThrow("finite");
  });
});
