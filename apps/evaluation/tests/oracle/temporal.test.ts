import { describe, expect, test } from "bun:test";
import {
  aggregateTemporalScores,
  calculateTemporalScore,
  type ScoredReading,
  type TemporalOptions,
} from "../../src/oracle/temporal.ts";

const SECOND = 1000;
const SCORE_RANGE = { maximum: 100, minimum: 1 } as const;

const reading = (second: number, score: number): ScoredReading => ({
  recordedAtEpochMilliseconds: second * SECOND,
  score,
  value: score,
});

const options = (
  maximumContinuityGapSeconds = 100,
  endSecond = 100
): TemporalOptions => ({
  maximumContinuityGapSeconds,
  scoreRange: SCORE_RANGE,
  unfavorableThreshold: 50,
  windowEndEpochMilliseconds: endSecond * SECOND,
  windowStartEpochMilliseconds: 0,
});

describe("duration-weighted temporal aggregation", () => {
  test("calculates no and full unfavorable duration", () => {
    const favorable = aggregateTemporalScores([reading(0, 100)], options());
    const unfavorable = aggregateTemporalScores([reading(0, 1)], options());

    expect(favorable.pLow).toBe(0);
    expect(favorable.temporalScore).toBe(100);
    expect(unfavorable.pLow).toBe(1);
    expect(unfavorable.temporalScore).toBe(1);
  });

  test("calculates exact 25 and 50 percent unfavorable duration", () => {
    const quarter = aggregateTemporalScores(
      [reading(0, 1), reading(25, 100)],
      options()
    );
    const half = aggregateTemporalScores(
      [reading(0, 1), reading(50, 100)],
      options()
    );

    expect(quarter.pLow).toBe(0.25);
    expect(half.pLow).toBe(0.5);
  });

  test("treats a score exactly at theta as favorable", () => {
    const result = aggregateTemporalScores([reading(0, 50)], options());

    expect(result.pLow).toBe(0);
    expect(result.temporalScore).toBe(75);
    expect(result.representedIntervals[0]?.unfavorable).toBe(false);
  });

  test("reproduces the C6-A duration-weighted result", () => {
    const result = aggregateTemporalScores(
      [reading(0, 100), reading(10, 1)],
      options(90)
    );

    expect(result.coveredDurationSeconds).toBe(100);
    expect(result.durationWeightedMean).toBeCloseTo(10.9, 12);
    expect(result.pLow).toBeCloseTo(0.9, 12);
    expect(result.temporalScore).toBeCloseTo(10.9, 12);
    expect(result.durationWeightedMean).not.toBe(50.5);
  });

  test("equals an arithmetic mean when represented durations are equal", () => {
    const scores = [100, 80, 60, 40];
    const readings = scores.map((score, index) => reading(index * 10, score));
    const result = aggregateTemporalScores(readings, options(10, 40));
    const arithmeticMean =
      scores.reduce((sum, score) => sum + score, 0) / scores.length;

    expect(result.durationWeightedMean).toBe(arithmeticMean);
    expect(result.pLow).toBe(0.25);
  });

  test("excludes time beyond continuity caps rather than injecting zero", () => {
    const result = aggregateTemporalScores(
      [
        reading(0, 100),
        reading(10, 100),
        reading(70, 100),
        reading(80, 100),
        reading(90, 100),
      ],
      options(20)
    );

    expect(result.coveredDurationSeconds).toBe(60);
    expect(result.missingDurationSeconds).toBe(40);
    expect(result.coverage).toBe(0.6);
    expect(result.durationWeightedMean).toBe(100);
    expect(result.pLow).toBe(0);
    expect(result.temporalScore).toBe(100);
    expect(result.missingIntervals).toEqual([
      {
        durationSeconds: 40,
        end: "1970-01-01T00:01:10.000Z",
        start: "1970-01-01T00:00:30.000Z",
      },
    ]);
  });

  test("clamps to the half-open window and caps the final reading", () => {
    const clamped = aggregateTemporalScores(
      [reading(-10, 100), reading(10, 80)],
      options(20, 20)
    );
    const finalCapped = aggregateTemporalScores([reading(90, 100)], {
      ...options(20, 200),
      windowStartEpochMilliseconds: 90 * SECOND,
    });

    expect(clamped.coveredDurationSeconds).toBe(20);
    expect(clamped.durationWeightedMean).toBe(90);
    expect(finalCapped.coveredDurationSeconds).toBe(20);
    expect(finalCapped.coverage).toBeCloseTo(20 / 110, 12);
  });

  test("reports empty input as uncovered without inventing a score", () => {
    const result = aggregateTemporalScores([], options(20));

    expect(result.status).toBe("noCoveredTime");
    expect(result.coverage).toBe(0);
    expect(result.durationWeightedMean).toBeNull();
    expect(result.pLow).toBeNull();
    expect(result.temporalScore).toBeNull();
  });

  test("rejects duplicate timestamps and invalid scores", () => {
    expect(() =>
      aggregateTemporalScores([reading(0, 100), reading(0, 80)], options())
    ).toThrow();
    expect(() => aggregateTemporalScores([reading(0, 0)], options())).toThrow();
  });
});

describe("temporal formula invariants", () => {
  test("matches the hand-calculated example", () => {
    expect(calculateTemporalScore(80, 0.3, SCORE_RANGE)).toBeCloseTo(75.15, 12);
  });

  test("is monotonic in mean and unfavorable proportion", () => {
    let index = 0;
    while (index <= 100) {
      const pLow = index / 100;
      const lowMean = calculateTemporalScore(25, pLow, SCORE_RANGE);
      const highMean = calculateTemporalScore(75, pLow, SCORE_RANGE);
      expect(highMean).toBeGreaterThanOrEqual(lowMean);

      if (index < 100) {
        const greaterPLow = calculateTemporalScore(
          75,
          (index + 1) / 100,
          SCORE_RANGE
        );
        expect(greaterPLow).toBeLessThanOrEqual(highMean);
      }
      expect(lowMean).toBeGreaterThanOrEqual(1);
      expect(highMean).toBeLessThanOrEqual(100);
      index += 1;
    }
  });
});
