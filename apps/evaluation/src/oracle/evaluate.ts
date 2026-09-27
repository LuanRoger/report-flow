import {
  millisecondsFromSeconds,
  parseUtcTimestamp,
  secondsFromMilliseconds,
  toUtcIsoString,
  validateWindow,
} from "../shared/time.ts";
import {
  type ModelConfig,
  type OracleReading,
  PARAMETER_CODES,
  type ParameterCode,
  type ParameterRecord,
} from "../shared/types.ts";
import { normalizeMeasurement } from "./normalization.ts";
import {
  aggregateTemporalScores,
  type DurationInterval,
  type RepresentedInterval,
} from "./temporal.ts";

export type InsufficiencyReason =
  | "absent"
  | "noCoveredTime"
  | "coverageBelowMinimum";

export interface NormalizedOracleReading {
  recordedAt: string;
  score: number;
  value: number;
}

export interface ParameterEvaluation {
  coverage: number;
  coveredDurationSeconds: number;
  durationWeightedMean: number | null;
  hasSufficientCoverage: boolean;
  insufficiencyReason: InsufficiencyReason | null;
  missingDurationSeconds: number;
  missingIntervals: DurationInterval[];
  normalizedReadings: NormalizedOracleReading[];
  parameterCode: ParameterCode;
  pLow: number | null;
  rawReadings: Array<{ recordedAt: string; value: number }>;
  representedIntervals: RepresentedInterval[];
  requestedDurationSeconds: number;
  status: "sufficient" | "insufficient";
  temporalScore: number | null;
  unfavorableDurationSeconds: number;
}

export interface WeightedScoreEvaluation {
  missingParameters: ParameterCode[];
  score: number | null;
  status: "sufficient" | "insufficient";
}

export interface PondEvaluation {
  finalScore: number | null;
  hasSufficientCoverage: boolean;
  insufficientParameters: ParameterCode[];
  maximumContinuityGapSeconds: number;
  minimumCoveragePerParameter: number;
  overallCoverage: number;
  parameterResults: ParameterRecord<ParameterEvaluation>;
  requestedWindow: {
    start: string;
    end: string;
    durationSeconds: number;
    convention: "[start,end)";
  };
  status: "sufficient" | "insufficient";
}

export interface EvaluationWindow {
  end: string;
  maximumContinuityGapSeconds?: number;
  start: string;
}

const validateWeights = (model: ModelConfig): void => {
  let weightSum = 0;
  for (const parameterCode of PARAMETER_CODES) {
    const weight = model.weights[parameterCode];
    if (!Number.isFinite(weight) || weight < 0) {
      throw new Error(
        `Weight for ${parameterCode} must be finite and nonnegative`
      );
    }
    weightSum += weight;
  }
  if (Math.abs(weightSum - 1) > model.weightSumTolerance) {
    throw new Error(
      `Weights sum to ${weightSum}, outside tolerance ${model.weightSumTolerance}`
    );
  }
};

export const calculateWeightedPondScore = (
  scores: Partial<Record<ParameterCode, number>>,
  model: ModelConfig
): WeightedScoreEvaluation => {
  validateWeights(model);
  const missingParameters = PARAMETER_CODES.filter(
    (parameterCode) => scores[parameterCode] === undefined
  );
  if (missingParameters.length > 0) {
    return {
      missingParameters,
      score: null,
      status: "insufficient",
    };
  }

  let score = 0;
  for (const parameterCode of PARAMETER_CODES) {
    const parameterScore = scores[parameterCode];
    if (parameterScore === undefined) {
      throw new Error(
        "A required score disappeared during weighted aggregation"
      );
    }
    if (
      !Number.isFinite(parameterScore) ||
      parameterScore < model.scoreRange.minimum ||
      parameterScore > model.scoreRange.maximum
    ) {
      throw new Error(
        `Score for ${parameterCode} must be within the configured score range`
      );
    }
    score += model.weights[parameterCode] * parameterScore;
  }

  return { missingParameters: [], score, status: "sufficient" };
};

const evaluateParameter = (
  parameterCode: ParameterCode,
  readings: readonly OracleReading[],
  window: EvaluationWindow,
  model: ModelConfig,
  maximumContinuityGapSeconds: number
): ParameterEvaluation => {
  const startEpochMilliseconds = parseUtcTimestamp(
    window.start,
    "window.start"
  );
  const endEpochMilliseconds = parseUtcTimestamp(window.end, "window.end");
  const requestedDurationSeconds = secondsFromMilliseconds(
    endEpochMilliseconds - startEpochMilliseconds
  );
  const sortedReadings = readings
    .map((reading) => ({ ...reading }))
    .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
  const normalizedReadings = sortedReadings.map((reading) => ({
    recordedAt: toUtcIsoString(
      parseUtcTimestamp(reading.recordedAt, `${parameterCode}.recordedAt`)
    ),
    score: normalizeMeasurement(parameterCode, reading.value, model),
    value: reading.value,
  }));

  const temporal = aggregateTemporalScores(
    normalizedReadings.map((reading) => ({
      recordedAtEpochMilliseconds: parseUtcTimestamp(
        reading.recordedAt,
        `${parameterCode}.recordedAt`
      ),
      score: reading.score,
      value: reading.value,
    })),
    {
      maximumContinuityGapSeconds,
      scoreRange: model.scoreRange,
      unfavorableThreshold: model.unfavorableThreshold,
      windowEndEpochMilliseconds: endEpochMilliseconds,
      windowStartEpochMilliseconds: startEpochMilliseconds,
    }
  );

  let insufficiencyReason: InsufficiencyReason | null = null;
  if (readings.length === 0) {
    insufficiencyReason = "absent";
  } else if (temporal.status === "noCoveredTime") {
    insufficiencyReason = "noCoveredTime";
  } else if (temporal.coverage < model.temporal.minimumCoveragePerParameter) {
    insufficiencyReason = "coverageBelowMinimum";
  }
  const hasSufficientCoverage = insufficiencyReason === null;

  return {
    coverage: temporal.coverage,
    coveredDurationSeconds: temporal.coveredDurationSeconds,
    durationWeightedMean: temporal.durationWeightedMean,
    hasSufficientCoverage,
    insufficiencyReason,
    missingDurationSeconds: temporal.missingDurationSeconds,
    missingIntervals: temporal.missingIntervals,
    normalizedReadings,
    parameterCode,
    pLow: temporal.pLow,
    rawReadings: sortedReadings.map(({ recordedAt, value }) => ({
      recordedAt,
      value,
    })),
    representedIntervals: temporal.representedIntervals,
    requestedDurationSeconds,
    status: hasSufficientCoverage ? "sufficient" : "insufficient",
    temporalScore: temporal.temporalScore,
    unfavorableDurationSeconds: temporal.unfavorableDurationSeconds,
  };
};

export const evaluatePondMeasurements = (
  readings: readonly OracleReading[],
  window: EvaluationWindow,
  model: ModelConfig
): PondEvaluation => {
  const durationMilliseconds = validateWindow(window.start, window.end);
  const maximumContinuityGapSeconds =
    window.maximumContinuityGapSeconds ??
    model.temporal.defaultMaximumContinuityGapSeconds;
  millisecondsFromSeconds(maximumContinuityGapSeconds);

  const groupedReadings: ParameterRecord<OracleReading[]> = {
    dissolvedOxygen: [],
    ph: [],
    salinity: [],
    temperature: [],
  };
  for (const reading of readings) {
    groupedReadings[reading.parameterCode].push(reading);
  }

  const parameterResults: ParameterRecord<ParameterEvaluation> = {
    dissolvedOxygen: evaluateParameter(
      "dissolvedOxygen",
      groupedReadings.dissolvedOxygen,
      window,
      model,
      maximumContinuityGapSeconds
    ),
    ph: evaluateParameter(
      "ph",
      groupedReadings.ph,
      window,
      model,
      maximumContinuityGapSeconds
    ),
    salinity: evaluateParameter(
      "salinity",
      groupedReadings.salinity,
      window,
      model,
      maximumContinuityGapSeconds
    ),
    temperature: evaluateParameter(
      "temperature",
      groupedReadings.temperature,
      window,
      model,
      maximumContinuityGapSeconds
    ),
  };

  let coverageSum = 0;
  const insufficientParameters: ParameterCode[] = [];
  const temporalScores: Partial<Record<ParameterCode, number>> = {};
  for (const parameterCode of PARAMETER_CODES) {
    const result = parameterResults[parameterCode];
    coverageSum += result.coverage;
    if (!result.hasSufficientCoverage) {
      insufficientParameters.push(parameterCode);
    }
    if (result.temporalScore !== null) {
      temporalScores[parameterCode] = result.temporalScore;
    }
  }

  const overallCoverage = coverageSum / PARAMETER_CODES.length;
  const hasSufficientCoverage = insufficientParameters.length === 0;
  const weightedScore = calculateWeightedPondScore(temporalScores, model);
  const finalScore = weightedScore.score;
  if (weightedScore.status === "sufficient" && finalScore === null) {
    throw new Error("Complete temporal scores did not produce a final score");
  }

  return {
    finalScore,
    hasSufficientCoverage,
    insufficientParameters,
    maximumContinuityGapSeconds,
    minimumCoveragePerParameter: model.temporal.minimumCoveragePerParameter,
    overallCoverage,
    parameterResults,
    requestedWindow: {
      convention: "[start,end)",
      durationSeconds: secondsFromMilliseconds(durationMilliseconds),
      end: toUtcIsoString(parseUtcTimestamp(window.end, "window.end")),
      start: toUtcIsoString(parseUtcTimestamp(window.start, "window.start")),
    },
    status: hasSufficientCoverage ? "sufficient" : "insufficient",
  };
};
