import { describe, expect, test } from "bun:test";
import { evaluateScenario } from "../../src/oracle/scenario.ts";
import {
  loadModelConfig,
  loadScoringScenarioConfig,
} from "../../src/shared/config.ts";
import { SCORING_SCENARIO_PATHS } from "../../src/shared/paths.ts";
import { PARAMETER_CODES } from "../../src/shared/types.ts";
import { compareAnalysisWithOracle } from "../../src/validation/analysis-comparison.ts";

const responseFromOracle = (
  evaluation: ReturnType<typeof evaluateScenario>["evaluation"],
  model: Awaited<ReturnType<typeof loadModelConfig>>
): Record<string, unknown> => {
  const parameterScores: Record<string, number> = {};
  const parameterStats: Record<string, unknown> = {};
  const parameterCoverage: Record<string, unknown> = {};
  let totalMeasurements = 0;

  for (const parameterCode of PARAMETER_CODES) {
    const result = evaluation.parameterResults[parameterCode];
    if (
      result.temporalScore === null ||
      result.durationWeightedMean === null ||
      result.pLow === null
    ) {
      throw new Error("Test fixture requires complete parameter scores");
    }
    parameterScores[parameterCode] = result.temporalScore;
    parameterStats[parameterCode] = {
      temporalMetrics: {
        coveragePercentage: result.coverage * 100,
        coveredDurationSeconds: result.coveredDurationSeconds,
        missingDurationSeconds: result.missingDurationSeconds,
        pLow: result.pLow,
        unfavorableDurationSeconds: result.unfavorableDurationSeconds,
        weightedMeanScore: result.durationWeightedMean,
      },
    };
    parameterCoverage[parameterCode] = {
      coveragePercentage: result.coverage * 100,
      coveredDurationSeconds: result.coveredDurationSeconds,
      missingDurationSeconds: result.missingDurationSeconds,
    };
    totalMeasurements += result.rawReadings.length;
  }

  return {
    aiSummary: null,
    endDate: evaluation.requestedWindow.end,
    executionTimings: {
      databaseQueryMs: 1,
      deterministicScoreMs: 1,
      embeddingMs: 0,
      includedPhases: {
        databaseQuery: true,
        deterministicScore: true,
        embedding: false,
        persistence: true,
        serialization: false,
        summary: false,
      },
      overheadMs: 0.5,
      persistenceMs: 1,
      summaryMs: 0,
      totalMs: 3.5,
    },
    finalScore: evaluation.finalScore,
    metadata: {
      criticalThreshold: model.unfavorableThreshold,
      executionStats: {
        dataCoverage: {
          coveragePercentage: evaluation.overallCoverage * 100,
          hasSufficientCoverage: evaluation.hasSufficientCoverage,
          minimumRequiredPercentage:
            model.temporal.minimumCoveragePerParameter * 100,
          missingParameters: [],
          parameterCoverage,
          presentParameters: [...PARAMETER_CODES],
        },
        totalMeasurements,
      },
      maximumContinuityGapSeconds: evaluation.maximumContinuityGapSeconds,
      minimumCoveragePercentage:
        model.temporal.minimumCoveragePerParameter * 100,
      parameterStats,
      parameterWeights: model.weights,
      windowConvention: "[start,end)",
    },
    parameterScores,
    pondId: 1,
    startDate: evaluation.requestedWindow.start,
  };
};

describe("analysis response comparison", () => {
  test("accepts a complete response matching the independent oracle", async () => {
    const model = await loadModelConfig();
    const scenario = await loadScoringScenarioConfig(SCORING_SCENARIO_PATHS[0]);
    const oracle = evaluateScenario(scenario, model).evaluation;
    const comparison = compareAnalysisWithOracle(
      responseFromOracle(oracle, model),
      oracle,
      model
    );

    expect(comparison.passed).toBe(true);
    expect(comparison.scoreErrorSummary).toMatchObject({
      maximumAbsoluteError: 0,
      meanAbsoluteError: 0,
      passed: true,
    });
  });

  test("keeps a C6-B score while requiring insufficient coverage metadata", async () => {
    const model = await loadModelConfig();
    const scenario = await loadScoringScenarioConfig(
      SCORING_SCENARIO_PATHS.at(-1) ?? ""
    );
    const oracle = evaluateScenario(scenario, model).evaluation;
    const response = responseFromOracle(oracle, model);
    const comparison = compareAnalysisWithOracle(response, oracle, model);

    expect(oracle.finalScore).toBe(100);
    expect(oracle.hasSufficientCoverage).toBe(false);
    expect(comparison.passed).toBe(true);
  });

  test("reports MAE and maximum score errors without hiding failures", async () => {
    const model = await loadModelConfig();
    const scenario = await loadScoringScenarioConfig(SCORING_SCENARIO_PATHS[0]);
    const oracle = evaluateScenario(scenario, model).evaluation;
    const response = responseFromOracle(oracle, model);
    response.finalScore = 99;

    const comparison = compareAnalysisWithOracle(response, oracle, model);
    expect(comparison.passed).toBe(false);
    expect(comparison.scoreErrorSummary.maximumAbsoluteError).toBe(1);
    expect(comparison.scoreErrorSummary.meanAbsoluteError).toBe(0.2);
  });
});
