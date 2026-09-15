import {
  checksumMeasurementRecords,
  expectedScenarioRowCount,
  generateScenarioMeasurements,
  scenarioTransitionTimestamps,
} from "../seed/generator/scenario.ts";
import { checksumJson } from "../shared/json.ts";
import type {
  InvalidPayloadConfig,
  ModelConfig,
  ParameterCode,
  ScoringScenarioConfig,
} from "../shared/types.ts";
import {
  evaluatePondMeasurements,
  type ParameterEvaluation,
  type PondEvaluation,
} from "./evaluate.ts";

export interface ScenarioOracleResult {
  evaluation: PondEvaluation;
  expectedRowCount: number;
  fixtureChecksum: string;
  generatedRowCount: number;
  modelConfig: ModelConfig;
  modelConfigChecksum: string;
  oracleVersion: "independent-oracle-v1";
  scenarioConfigChecksum: string;
  scenarioDescription: string;
  scenarioId: string;
  schemaVersion: 1;
  transitionTimestamps: Partial<Record<ParameterCode, string[]>>;
}

export interface CompactParameterResult {
  coverage: number;
  coveredDurationSeconds: number;
  durationWeightedMean: number | null;
  insufficiencyReason: ParameterEvaluation["insufficiencyReason"];
  missingDurationSeconds: number;
  pLow: number | null;
  readingCount: number;
  representedIntervalCount: number;
  status: ParameterEvaluation["status"];
  temporalScore: number | null;
  unfavorableDurationSeconds: number;
}

const compactParameterResult = (
  result: ParameterEvaluation
): CompactParameterResult => ({
  coverage: result.coverage,
  coveredDurationSeconds: result.coveredDurationSeconds,
  durationWeightedMean: result.durationWeightedMean,
  insufficiencyReason: result.insufficiencyReason,
  missingDurationSeconds: result.missingDurationSeconds,
  pLow: result.pLow,
  readingCount: result.rawReadings.length,
  representedIntervalCount: result.representedIntervals.length,
  status: result.status,
  temporalScore: result.temporalScore,
  unfavorableDurationSeconds: result.unfavorableDurationSeconds,
});

export const evaluateScenario = (
  scenario: ScoringScenarioConfig,
  model: ModelConfig
): ScenarioOracleResult => {
  const measurements = generateScenarioMeasurements(scenario, model);
  const expectedRowCount = expectedScenarioRowCount(scenario);
  const oracleReadings = measurements.map(
    ({ parameterCode, recordedAt, value }) => ({
      parameterCode,
      recordedAt,
      value,
    })
  );

  return {
    evaluation: evaluatePondMeasurements(
      oracleReadings,
      {
        end: scenario.end,
        maximumContinuityGapSeconds: scenario.maximumContinuityGapSeconds,
        start: scenario.start,
      },
      model
    ),
    expectedRowCount,
    fixtureChecksum: checksumMeasurementRecords(measurements),
    generatedRowCount: measurements.length,
    modelConfig: model,
    modelConfigChecksum: checksumJson(model),
    oracleVersion: "independent-oracle-v1",
    scenarioConfigChecksum: checksumJson(scenario),
    scenarioDescription: scenario.description,
    scenarioId: scenario.id,
    schemaVersion: 1,
    transitionTimestamps: scenarioTransitionTimestamps(scenario),
  };
};

export const buildOracleSummary = (
  model: ModelConfig,
  scenarios: readonly ScoringScenarioConfig[],
  invalidPayloadConfig: InvalidPayloadConfig
): Record<string, unknown> => {
  const scenarioResults = scenarios.map((scenario) =>
    evaluateScenario(scenario, model)
  );

  return {
    invalidPayloadFixtures: {
      acceptedControlCount: invalidPayloadConfig.acceptedControls.length,
      caseIds: invalidPayloadConfig.cases.map(({ id }) => id),
      configChecksum: checksumJson(invalidPayloadConfig),
      invalidCaseCount: invalidPayloadConfig.cases.length,
      scenarioId: invalidPayloadConfig.id,
    },
    modelConfig: model,
    modelConfigChecksum: checksumJson(model),
    modelVersion: model.modelVersion,
    oracleVersion: "independent-oracle-v1",
    scenarios: scenarioResults.map((result) => ({
      expectedRowCount: result.expectedRowCount,
      finalScore: result.evaluation.finalScore,
      fixtureChecksum: result.fixtureChecksum,
      generatedRowCount: result.generatedRowCount,
      hasSufficientCoverage: result.evaluation.hasSufficientCoverage,
      insufficientParameters: result.evaluation.insufficientParameters,
      maximumContinuityGapSeconds:
        result.evaluation.maximumContinuityGapSeconds,
      overallCoverage: result.evaluation.overallCoverage,
      parameters: {
        dissolvedOxygen: compactParameterResult(
          result.evaluation.parameterResults.dissolvedOxygen
        ),
        ph: compactParameterResult(result.evaluation.parameterResults.ph),
        salinity: compactParameterResult(
          result.evaluation.parameterResults.salinity
        ),
        temperature: compactParameterResult(
          result.evaluation.parameterResults.temperature
        ),
      },
      scenarioConfigChecksum: result.scenarioConfigChecksum,
      scenarioDescription: result.scenarioDescription,
      scenarioId: result.scenarioId,
      status: result.evaluation.status,
      transitionTimestamps: result.transitionTimestamps,
    })),
    schemaVersion: 1,
  };
};
