import { describe, expect, test } from "bun:test";
import {
  calculateWeightedPondScore,
  evaluatePondMeasurements,
} from "../../src/oracle/evaluate.ts";
import { evaluateScenario } from "../../src/oracle/scenario.ts";
import { generateScenarioMeasurements } from "../../src/seed/generator/scenario.ts";
import {
  loadAllScoringScenarioConfigs,
  loadModelConfig,
} from "../../src/shared/config.ts";
import type { ScoringScenarioId } from "../../src/shared/types.ts";

const CHECKSUM_PATTERN = /^sha256:[a-f0-9]{64}$/u;

const [model, scenarios] = await Promise.all([
  loadModelConfig(),
  loadAllScoringScenarioConfigs(),
]);
const results = new Map(
  scenarios.map((scenario) => [scenario.id, evaluateScenario(scenario, model)])
);

const resultFor = (id: ScoringScenarioId) => {
  const result = results.get(id);
  if (result === undefined) {
    throw new Error(`Missing scenario result: ${id}`);
  }
  return result;
};

describe("tracked model contract", () => {
  test("uses the frozen runtime codes, parameters, threshold, and weights", () => {
    expect(model.runtimeParameterCodes).toEqual([
      "temperature",
      "ph",
      "salinity",
      "dissolvedOxygen",
    ]);
    expect(model.normalization.temperature).toEqual({
      kind: "gaussian",
      mu: 30,
      sigma: 3,
    });
    expect(model.normalization.ph).toEqual({
      kind: "gaussian",
      mu: 8,
      sigma: 0.75,
    });
    expect(model.normalization.salinity).toEqual({
      kind: "gaussian",
      mu: 20,
      sigma: 7.5,
    });
    expect(model.normalization.dissolvedOxygen).toEqual({
      halfWidth: 2,
      kind: "symmetricTriangle",
      reference: 5,
    });
    expect(model.unfavorableThreshold).toBe(50);
    expect(model.temporal.defaultMaximumContinuityGapSeconds).toBe(20);
    expect(model.temporal.minimumCoveragePerParameter).toBe(0.7);
    expect(model.temporal.finalScoreAvailabilityRule).toBe(
      "allParametersHaveTemporalScores"
    );
    expect(model.weights).toEqual({
      dissolvedOxygen: 0.33,
      ph: 0.22,
      salinity: 0.17,
      temperature: 0.28,
    });
  });

  test("has nonnegative weights that sum to one", () => {
    const weights = Object.values(model.weights);
    expect(weights.every((weight) => weight >= 0)).toBe(true);
    expect(weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 12);
  });
});

describe("oracle scenarios", () => {
  test("C1 is exactly 100 throughout", () => {
    const c1 = resultFor("C1");

    expect(c1.evaluation.finalScore).toBe(100);
    expect(c1.evaluation.overallCoverage).toBe(1);
    for (const parameter of Object.values(c1.evaluation.parameterResults)) {
      expect(parameter.durationWeightedMean).toBe(100);
      expect(parameter.pLow).toBe(0);
      expect(parameter.temporalScore).toBe(100);
      expect(parameter.coverage).toBe(1);
    }
  });

  test("C2 Gaussian values are approximately 94.65 and oxygen is 75.25", () => {
    const c2 = resultFor("C2").evaluation;

    expect(
      c2.parameterResults.temperature.normalizedReadings[0]?.score
    ).toBeCloseTo(94.65, 2);
    expect(c2.parameterResults.ph.normalizedReadings[0]?.score).toBeCloseTo(
      94.65,
      2
    );
    expect(
      c2.parameterResults.salinity.normalizedReadings[0]?.score
    ).toBeCloseTo(94.65, 2);
    expect(
      c2.parameterResults.dissolvedOxygen.normalizedReadings[0]?.score
    ).toBe(75.25);
  });

  test("C3 variants have exact duration-weighted pLow and ordering", () => {
    const c1Score = resultFor("C1").evaluation.finalScore;
    const c325 = resultFor("C3-25").evaluation;
    const c350 = resultFor("C3-50").evaluation;

    expect(c325.parameterResults.temperature.pLow).toBe(0.25);
    expect(c350.parameterResults.temperature.pLow).toBe(0.5);
    expect(c350.finalScore).toBeLessThan(c325.finalScore ?? 0);
    expect(c325.finalScore).toBeLessThan(c1Score ?? 0);
  });

  test("C4 contains an exact six-hour oxygen event", () => {
    const oxygen = resultFor("C4").evaluation.parameterResults.dissolvedOxygen;

    expect(oxygen.unfavorableDurationSeconds).toBe(6 * 60 * 60);
    expect(oxygen.pLow).toBe(0.25);
    expect(oxygen.durationWeightedMean).toBe(75.25);
    expect(oxygen.temporalScore).toBe(75.25);
  });

  test("C1, C2, and C5 have the required ordering", () => {
    const c1 = resultFor("C1").evaluation.finalScore;
    const c2 = resultFor("C2").evaluation.finalScore;
    const c5 = resultFor("C5").evaluation.finalScore;

    expect(c1).toBeGreaterThan(c2 ?? 0);
    expect(c2).toBeGreaterThan(c5 ?? 0);
  });

  test("C6-A uses a 90-second cap and yields 10.9 for oxygen", () => {
    const c6a = resultFor("C6-A").evaluation;
    const oxygen = c6a.parameterResults.dissolvedOxygen;

    expect(c6a.maximumContinuityGapSeconds).toBeGreaterThanOrEqual(90);
    expect(oxygen.durationWeightedMean).toBeCloseTo(10.9, 12);
    expect(oxygen.pLow).toBeCloseTo(0.9, 12);
    expect(oxygen.temporalScore).toBeCloseTo(10.9, 12);
  });

  test("C6-B cannot hide 60 percent parameter coverage behind 90 percent overall", () => {
    const c6b = resultFor("C6-B").evaluation;
    const oxygen = c6b.parameterResults.dissolvedOxygen;

    expect(oxygen.coverage).toBe(0.6);
    expect(oxygen.durationWeightedMean).toBe(100);
    expect(oxygen.temporalScore).toBe(100);
    expect(c6b.parameterResults.temperature.coverage).toBe(1);
    expect(c6b.parameterResults.ph.coverage).toBe(1);
    expect(c6b.parameterResults.salinity.coverage).toBe(1);
    expect(c6b.overallCoverage).toBe(0.9);
    expect(oxygen.status).toBe("insufficient");
    expect(oxygen.insufficiencyReason).toBe("coverageBelowMinimum");
    expect(c6b.hasSufficientCoverage).toBe(false);
    expect(c6b.status).toBe("insufficient");
    expect(c6b.finalScore).toBe(100);
    expect(c6b.insufficientParameters).toEqual(["dissolvedOxygen"]);
  });

  test("scenario outputs include deterministic counts and checksums", () => {
    for (const result of results.values()) {
      expect(result.generatedRowCount).toBe(result.expectedRowCount);
      expect(result.fixtureChecksum).toMatch(CHECKSUM_PATTERN);
      expect(result.scenarioConfigChecksum).toMatch(CHECKSUM_PATTERN);
      expect(result.modelConfigChecksum).toMatch(CHECKSUM_PATTERN);
    }
  });
});

describe("final score insufficiency and invariants", () => {
  test("matches a hand-calculated weighted score", () => {
    const result = calculateWeightedPondScore(
      {
        dissolvedOxygen: 40,
        ph: 80,
        salinity: 60,
        temperature: 100,
      },
      model
    );

    expect(result.status).toBe("sufficient");
    expect(result.score).toBeCloseTo(69, 12);
  });

  test("never substitutes a value for an absent parameter", () => {
    const scenario = scenarios.find(({ id }) => id === "C1");
    if (scenario === undefined) {
      throw new Error("C1 scenario is required");
    }
    const measurements = generateScenarioMeasurements(scenario, model)
      .filter(({ parameterCode }) => parameterCode !== "salinity")
      .map(({ parameterCode, recordedAt, value }) => ({
        parameterCode,
        recordedAt,
        value,
      }));
    const result = evaluatePondMeasurements(
      measurements,
      { end: scenario.end, start: scenario.start },
      model
    );

    expect(result.parameterResults.salinity.status).toBe("insufficient");
    expect(result.parameterResults.salinity.insufficiencyReason).toBe("absent");
    expect(result.parameterResults.salinity.temporalScore).toBeNull();
    expect(result.parameterResults.salinity.coverage).toBe(0);
    expect(result.status).toBe("insufficient");
    expect(result.finalScore).toBeNull();
  });

  test("does not score a present parameter with no covered time", () => {
    const scenario = scenarios.find(({ id }) => id === "C1");
    if (scenario === undefined) {
      throw new Error("C1 scenario is required");
    }
    const windowDurationMilliseconds =
      Date.parse(scenario.end) - Date.parse(scenario.start);
    const measurements = generateScenarioMeasurements(scenario, model).map(
      ({ parameterCode, recordedAt, value }) => ({
        parameterCode,
        recordedAt:
          parameterCode === "salinity"
            ? new Date(
                Date.parse(recordedAt) + windowDurationMilliseconds
              ).toISOString()
            : recordedAt,
        value,
      })
    );
    const result = evaluatePondMeasurements(
      measurements,
      { end: scenario.end, start: scenario.start },
      model
    );

    expect(result.parameterResults.salinity.status).toBe("insufficient");
    expect(result.parameterResults.salinity.insufficiencyReason).toBe(
      "noCoveredTime"
    );
    expect(result.parameterResults.salinity.temporalScore).toBeNull();
    expect(result.parameterResults.salinity.coverage).toBe(0);
    expect(result.status).toBe("insufficient");
    expect(result.finalScore).toBeNull();
  });

  test("reports missing input from direct weighted aggregation", () => {
    const result = calculateWeightedPondScore(
      { ph: 100, salinity: 100, temperature: 100 },
      model
    );

    expect(result).toEqual({
      missingParameters: ["dissolvedOxygen"],
      score: null,
      status: "insufficient",
    });
  });

  test("cannot decrease when one sufficient parameter score increases", () => {
    const lower = calculateWeightedPondScore(
      {
        dissolvedOxygen: 80,
        ph: 60,
        salinity: 70,
        temperature: 40,
      },
      model
    );
    const higher = calculateWeightedPondScore(
      {
        dissolvedOxygen: 80,
        ph: 60,
        salinity: 70,
        temperature: 50,
      },
      model
    );

    expect(higher.score).toBeGreaterThan(lower.score ?? 0);
    expect(lower.score).toBeGreaterThanOrEqual(1);
    expect(higher.score).toBeLessThanOrEqual(100);
  });
});
