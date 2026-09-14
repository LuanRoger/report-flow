import { describe, expect, test } from "bun:test";
import type { ParameterCode } from "database";
import type {
  NormalizedScore,
  ParameterMetrics,
  ParameterTemporalScore,
} from "../types/analysis";
import {
  calculateParameterTemporalScores,
  calculatePondScore,
  calculateTemporalMetrics,
  calculateTemporalScore,
  checkDataCoverage,
} from "./scoring";

const WINDOW_START = new Date("2026-01-01T00:00:00.000Z");
const WINDOW_END = new Date("2026-01-01T00:01:40.000Z");

function normalizedScore(
  parameterCode: ParameterCode,
  seconds: number,
  score: number
): NormalizedScore {
  return {
    parameterCode,
    recordedAt: new Date(WINDOW_START.getTime() + seconds * 1000),
    score,
  };
}

function temporalScore(
  parameterCode: ParameterCode,
  coveragePercentage: number
): ParameterTemporalScore {
  const coveredDurationSeconds = coveragePercentage;
  const metrics: ParameterMetrics = {
    coveragePercentage,
    coveredDurationSeconds,
    missingDurationSeconds: 100 - coveredDurationSeconds,
    pLow: 0,
    unfavorableDurationSeconds: 0,
    unfavorableIntervals: [],
    weightedMeanScore: 100,
  };

  return {
    metrics,
    parameterCode,
    temporalScore: 100,
  };
}

describe("Duration-weighted temporal metrics", () => {
  test("matches the C6-A irregular interval example", () => {
    const metrics = calculateTemporalMetrics(
      [
        normalizedScore("dissolvedOxygen", 0, 100),
        normalizedScore("dissolvedOxygen", 10, 1),
      ],
      WINDOW_START,
      WINDOW_END,
      100
    );

    expect(metrics.coveragePercentage).toBe(100);
    expect(metrics.weightedMeanScore).toBeCloseTo(10.9, 8);
    expect(metrics.pLow).toBeCloseTo(0.9, 8);
    expect(metrics.unfavorableDurationSeconds).toBe(90);
    expect(calculateTemporalScore(metrics)).toBeCloseTo(10.9, 8);
  });

  test("classifies time beyond the continuity limit as missing", () => {
    const metrics = calculateTemporalMetrics(
      [
        normalizedScore("dissolvedOxygen", 0, 100),
        normalizedScore("dissolvedOxygen", 10, 1),
      ],
      WINDOW_START,
      WINDOW_END,
      20
    );

    expect(metrics.coveredDurationSeconds).toBe(30);
    expect(metrics.missingDurationSeconds).toBe(70);
    expect(metrics.coveragePercentage).toBe(30);
    expect(metrics.pLow).toBeCloseTo(2 / 3, 8);
    expect(metrics.weightedMeanScore).toBeCloseTo(34, 8);
  });

  test("treats a score equal to theta as favorable", () => {
    const metrics = calculateTemporalMetrics(
      [normalizedScore("temperature", 0, 50)],
      WINDOW_START,
      WINDOW_END,
      100
    );

    expect(metrics.pLow).toBe(0);
    expect(metrics.unfavorableDurationSeconds).toBe(0);
  });

  test("merges adjacent unfavorable intervals", () => {
    const metrics = calculateTemporalMetrics(
      [
        normalizedScore("ph", 0, 40),
        normalizedScore("ph", 10, 30),
        normalizedScore("ph", 20, 80),
      ],
      WINDOW_START,
      new Date(WINDOW_START.getTime() + 30_000),
      20
    );

    expect(metrics.unfavorableIntervals).toEqual([
      {
        durationSeconds: 20,
        end: new Date(WINDOW_START.getTime() + 20_000),
        start: WINDOW_START,
      },
    ]);
  });

  test("rejects duplicate timestamps", () => {
    const duplicateScores = [
      normalizedScore("salinity", 0, 100),
      normalizedScore("salinity", 0, 80),
    ];

    expect(() =>
      calculateTemporalMetrics(duplicateScores, WINDOW_START, WINDOW_END, 100)
    ).toThrow("Duplicate salinity reading timestamp");
  });
});

describe("Temporal and pond scores", () => {
  test("uses the two-component temporal formula", () => {
    const metrics: ParameterMetrics = {
      coveragePercentage: 100,
      coveredDurationSeconds: 100,
      missingDurationSeconds: 0,
      pLow: 0.3,
      unfavorableDurationSeconds: 30,
      unfavorableIntervals: [],
      weightedMeanScore: 80,
    };

    expect(calculateTemporalScore(metrics)).toBeCloseTo(75.15, 8);
  });

  test("uses all four configured parameter weights", () => {
    expect(
      calculatePondScore({
        dissolvedOxygen: 100,
        ph: 70,
        salinity: 60,
        temperature: 80,
      })
    ).toBeCloseTo(81, 8);
  });

  test("does not create fallback scores for missing parameters", () => {
    expect(() =>
      calculateParameterTemporalScores(
        {
          dissolvedOxygen: [],
          ph: [],
          salinity: [],
          temperature: [],
        },
        WINDOW_START,
        WINDOW_END
      )
    ).toThrow("without covered data");
  });
});

describe("Coverage", () => {
  test("requires every parameter to satisfy the threshold", () => {
    const coverage = checkDataCoverage({
      dissolvedOxygen: temporalScore("dissolvedOxygen", 100),
      ph: temporalScore("ph", 100),
      salinity: temporalScore("salinity", 50),
      temperature: temporalScore("temperature", 100),
    });

    expect(coverage.coveragePercentage).toBe(87.5);
    expect(coverage.hasSufficientCoverage).toBe(false);
    expect(coverage.missingParameters).toEqual([]);
  });

  test("reports entirely missing parameters explicitly", () => {
    const coverage = checkDataCoverage({
      dissolvedOxygen: temporalScore("dissolvedOxygen", 100),
      temperature: temporalScore("temperature", 100),
    });

    expect(coverage.hasSufficientCoverage).toBe(false);
    expect(coverage.missingParameters).toEqual(["ph", "salinity"]);
    expect(coverage.parameterCoverage.ph.coveragePercentage).toBe(0);
  });
});
