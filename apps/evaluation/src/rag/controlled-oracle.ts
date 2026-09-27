import {
  calculateWeightedPondScore,
  type ParameterEvaluation,
  type PondEvaluation,
} from "../oracle/evaluate.ts";
import { normalizeMeasurement } from "../oracle/normalization.ts";
import { evaluateScenario } from "../oracle/scenario.ts";
import { calculateTemporalScore } from "../oracle/temporal.ts";
import {
  parseUtcTimestamp,
  timestampAtOffsetSeconds,
  toUtcIsoString,
} from "../shared/time.ts";
import type {
  ModelConfig,
  ParameterCode,
  ParameterRecord,
  ScoringScenarioConfig,
} from "../shared/types.ts";
import { PARAMETER_CODES } from "../shared/types.ts";

const secondsBetween = (start: string, end: string): number =>
  (parseUtcTimestamp(end, "scenario.end") -
    parseUtcTimestamp(start, "scenario.start")) /
  1000;

const evaluateCadenceParameter = (
  scenario: ScoringScenarioConfig,
  model: ModelConfig,
  parameterCode: ParameterCode
): ParameterEvaluation => {
  const series = scenario.series[parameterCode];
  if (series.mode !== "cadence") {
    throw new Error(`${parameterCode} is not a cadence series`);
  }
  const startEpochMilliseconds = parseUtcTimestamp(
    scenario.start,
    `${scenario.id}.start`
  );
  const requestedDurationSeconds = secondsBetween(scenario.start, scenario.end);
  let unfavorableDurationSeconds = 0;
  let weightedScoreTotal = 0;
  const representedIntervals = series.segments.map((segment, index) => {
    const nextOffset =
      series.segments[index + 1]?.startOffsetSeconds ??
      requestedDurationSeconds;
    const durationSeconds = nextOffset - segment.startOffsetSeconds;
    const score = normalizeMeasurement(parameterCode, segment.value, model);
    const unfavorable = score < model.unfavorableThreshold;
    if (unfavorable) {
      unfavorableDurationSeconds += durationSeconds;
    }
    weightedScoreTotal += score * durationSeconds;
    return {
      durationSeconds,
      end: toUtcIsoString(
        timestampAtOffsetSeconds(startEpochMilliseconds, nextOffset)
      ),
      readingRecordedAt: toUtcIsoString(
        timestampAtOffsetSeconds(
          startEpochMilliseconds,
          segment.startOffsetSeconds
        )
      ),
      score,
      start: toUtcIsoString(
        timestampAtOffsetSeconds(
          startEpochMilliseconds,
          segment.startOffsetSeconds
        )
      ),
      unfavorable,
      value: segment.value,
    };
  });
  const durationWeightedMean = weightedScoreTotal / requestedDurationSeconds;
  const pLow = unfavorableDurationSeconds / requestedDurationSeconds;
  const temporalScore = calculateTemporalScore(
    durationWeightedMean,
    pLow,
    model.scoreRange
  );

  return {
    coverage: 1,
    coveredDurationSeconds: requestedDurationSeconds,
    durationWeightedMean,
    hasSufficientCoverage: true,
    insufficiencyReason: null,
    missingDurationSeconds: 0,
    missingIntervals: [],
    normalizedReadings: representedIntervals.map(
      ({ readingRecordedAt, score, value }) => ({
        recordedAt: readingRecordedAt,
        score,
        value,
      })
    ),
    parameterCode,
    pLow,
    rawReadings: representedIntervals.map(({ readingRecordedAt, value }) => ({
      recordedAt: readingRecordedAt,
      value,
    })),
    representedIntervals,
    requestedDurationSeconds,
    status: "sufficient",
    temporalScore,
    unfavorableDurationSeconds,
  };
};

const hasOnlyCadenceSeries = (scenario: ScoringScenarioConfig): boolean =>
  PARAMETER_CODES.every(
    (parameterCode) => scenario.series[parameterCode].mode === "cadence"
  );

export const evaluateControlledScenario = (
  scenario: ScoringScenarioConfig,
  model: ModelConfig
): PondEvaluation => {
  if (!hasOnlyCadenceSeries(scenario)) {
    return evaluateScenario(scenario, model).evaluation;
  }

  const parameterResults: ParameterRecord<ParameterEvaluation> = {
    dissolvedOxygen: evaluateCadenceParameter(
      scenario,
      model,
      "dissolvedOxygen"
    ),
    ph: evaluateCadenceParameter(scenario, model, "ph"),
    salinity: evaluateCadenceParameter(scenario, model, "salinity"),
    temperature: evaluateCadenceParameter(scenario, model, "temperature"),
  };
  const temporalScores: Partial<Record<ParameterCode, number>> = {};
  for (const parameterCode of PARAMETER_CODES) {
    const { temporalScore } = parameterResults[parameterCode];
    if (temporalScore === null) {
      throw new Error(`${scenario.id} has no ${parameterCode} temporal score`);
    }
    temporalScores[parameterCode] = temporalScore;
  }
  const weightedScore = calculateWeightedPondScore(temporalScores, model);
  if (weightedScore.score === null) {
    throw new Error(`${scenario.id} did not produce a controlled final score`);
  }
  const requestedDurationSeconds = secondsBetween(scenario.start, scenario.end);

  return {
    finalScore: weightedScore.score,
    hasSufficientCoverage: true,
    insufficientParameters: [],
    maximumContinuityGapSeconds:
      scenario.maximumContinuityGapSeconds ??
      model.temporal.defaultMaximumContinuityGapSeconds,
    minimumCoveragePerParameter: model.temporal.minimumCoveragePerParameter,
    overallCoverage: 1,
    parameterResults,
    requestedWindow: {
      convention: "[start,end)",
      durationSeconds: requestedDurationSeconds,
      end: scenario.end,
      start: scenario.start,
    },
    status: "sufficient",
  };
};
