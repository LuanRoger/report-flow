import type { PondEvaluation } from "../oracle/evaluate.ts";
import type {
  ModelConfig,
  ParameterCode,
  ParameterRecord,
} from "../shared/types.ts";
import { PARAMETER_CODES } from "../shared/types.ts";
import { asArray, asRecord } from "../shared/validation.ts";

export interface NumericComparison {
  absoluteError: number;
  actual: number;
  expected: number;
  passed: boolean;
  path: string;
  tolerance: number;
}

export interface StructuralComparison {
  actual: unknown;
  expected: unknown;
  passed: boolean;
  path: string;
}

export interface ScoreErrorSummary {
  comparisonCount: number;
  maximumAbsoluteError: number;
  meanAbsoluteError: number;
  passed: boolean;
  targets: {
    maximumAbsoluteError: number;
    meanAbsoluteError: number;
  };
}

export interface AnalysisComparisonResult {
  metricComparisons: NumericComparison[];
  passed: boolean;
  scoreComparisons: NumericComparison[];
  scoreErrorSummary: ScoreErrorSummary;
  structuralComparisons: StructuralComparison[];
}

const valueAtPath = (value: unknown, path: string): unknown => {
  let current = value;
  for (const segment of path.split(".")) {
    const record = asRecord(current, path);
    current = record[segment];
  }
  return current;
};

const numberAtPath = (value: unknown, path: string): number => {
  const number = valueAtPath(value, path);
  if (typeof number !== "number" || !Number.isFinite(number)) {
    throw new Error(`${path} must be a finite number`);
  }
  return number;
};

const compareNumber = (
  actualRoot: unknown,
  path: string,
  expected: number,
  tolerance: number
): NumericComparison => {
  const actual = numberAtPath(actualRoot, path);
  const absoluteError = Math.abs(actual - expected);
  return {
    absoluteError,
    actual,
    expected,
    passed: absoluteError <= tolerance,
    path,
    tolerance,
  };
};

const compareValue = (
  actualRoot: unknown,
  path: string,
  expected: unknown
): StructuralComparison => {
  const actual = valueAtPath(actualRoot, path);
  return {
    actual,
    expected,
    passed: Object.is(actual, expected),
    path,
  };
};

const compareDate = (
  actualRoot: unknown,
  path: string,
  expected: string
): StructuralComparison => {
  const actualValue = valueAtPath(actualRoot, path);
  const actualEpoch =
    typeof actualValue === "string" ? Date.parse(actualValue) : Number.NaN;
  const expectedEpoch = Date.parse(expected);
  return {
    actual: actualValue,
    expected,
    passed:
      Number.isFinite(actualEpoch) &&
      Number.isFinite(expectedEpoch) &&
      actualEpoch === expectedEpoch,
    path,
  };
};

const parameterMetricComparisons = (
  actual: unknown,
  oracle: PondEvaluation,
  parameterCode: ParameterCode
): NumericComparison[] => {
  const expected = oracle.parameterResults[parameterCode];
  if (
    expected.durationWeightedMean === null ||
    expected.pLow === null ||
    expected.temporalScore === null
  ) {
    throw new Error(
      `Scenario cannot be compared because ${parameterCode} has no temporal score`
    );
  }
  const prefix = `metadata.parameterStats.${parameterCode}.temporalMetrics`;
  return [
    compareNumber(
      actual,
      `${prefix}.weightedMeanScore`,
      expected.durationWeightedMean,
      0.000_001
    ),
    compareNumber(actual, `${prefix}.pLow`, expected.pLow, 0.000_000_001),
    compareNumber(
      actual,
      `${prefix}.coveragePercentage`,
      expected.coverage * 100,
      0.000_001
    ),
    compareNumber(
      actual,
      `${prefix}.coveredDurationSeconds`,
      expected.coveredDurationSeconds,
      0.000_001
    ),
    compareNumber(
      actual,
      `${prefix}.missingDurationSeconds`,
      expected.missingDurationSeconds,
      0.000_001
    ),
    compareNumber(
      actual,
      `${prefix}.unfavorableDurationSeconds`,
      expected.unfavorableDurationSeconds,
      0.000_001
    ),
  ];
};

const buildScoreSummary = (
  comparisons: readonly NumericComparison[]
): ScoreErrorSummary => {
  let totalAbsoluteError = 0;
  let maximumAbsoluteError = 0;
  for (const comparison of comparisons) {
    totalAbsoluteError += comparison.absoluteError;
    maximumAbsoluteError = Math.max(
      maximumAbsoluteError,
      comparison.absoluteError
    );
  }
  const meanAbsoluteError = totalAbsoluteError / comparisons.length;
  const targets = {
    maximumAbsoluteError: 0.05,
    meanAbsoluteError: 0.01,
  };
  return {
    comparisonCount: comparisons.length,
    maximumAbsoluteError,
    meanAbsoluteError,
    passed:
      meanAbsoluteError <= targets.meanAbsoluteError &&
      maximumAbsoluteError <= targets.maximumAbsoluteError,
    targets,
  };
};

const compareParameterOrderIndependent = (
  actualRoot: unknown,
  path: string,
  expected: readonly ParameterCode[]
): StructuralComparison => {
  const value = asArray(valueAtPath(actualRoot, path), path);
  const actual = value.map((entry) => String(entry)).sort();
  const sortedExpected = [...expected].sort();
  return {
    actual,
    expected: sortedExpected,
    passed:
      actual.length === sortedExpected.length &&
      actual.every((entry, index) => entry === sortedExpected[index]),
    path,
  };
};

export interface AnalysisComparisonOptions {
  expectedPondId?: number;
}

export const compareAnalysisWithOracle = (
  actual: unknown,
  oracle: PondEvaluation,
  model: ModelConfig,
  options: AnalysisComparisonOptions = {}
): AnalysisComparisonResult => {
  const scoreComparisons: NumericComparison[] = [];
  if (oracle.finalScore === null) {
    throw new Error(
      "Analysis endpoint comparison requires an oracle final score"
    );
  }
  scoreComparisons.push(
    compareNumber(actual, "finalScore", oracle.finalScore, 0.05)
  );

  const metricComparisons: NumericComparison[] = [
    compareNumber(
      actual,
      "metadata.executionStats.dataCoverage.coveragePercentage",
      oracle.overallCoverage * 100,
      0.000_001
    ),
    compareNumber(
      actual,
      "metadata.maximumContinuityGapSeconds",
      oracle.maximumContinuityGapSeconds,
      0
    ),
    compareNumber(
      actual,
      "metadata.minimumCoveragePercentage",
      model.temporal.minimumCoveragePerParameter * 100,
      0
    ),
    compareNumber(
      actual,
      "metadata.criticalThreshold",
      model.unfavorableThreshold,
      0
    ),
  ];

  for (const parameterCode of PARAMETER_CODES) {
    const expectedTemporalScore =
      oracle.parameterResults[parameterCode].temporalScore;
    if (expectedTemporalScore === null) {
      throw new Error(`Oracle has no ${parameterCode} temporal score`);
    }
    scoreComparisons.push(
      compareNumber(
        actual,
        `parameterScores.${parameterCode}`,
        expectedTemporalScore,
        0.05
      )
    );
    metricComparisons.push(
      ...parameterMetricComparisons(actual, oracle, parameterCode),
      compareNumber(
        actual,
        `metadata.parameterWeights.${parameterCode}`,
        model.weights[parameterCode],
        model.weightSumTolerance
      )
    );
  }

  const structuralComparisons: StructuralComparison[] = [
    compareValue(actual, "aiSummary", null),
    compareValue(actual, "pondId", options.expectedPondId ?? 1),
    compareDate(actual, "startDate", oracle.requestedWindow.start),
    compareDate(actual, "endDate", oracle.requestedWindow.end),
    compareValue(actual, "metadata.windowConvention", "[start,end)"),
    compareValue(
      actual,
      "metadata.executionStats.dataCoverage.hasSufficientCoverage",
      oracle.hasSufficientCoverage
    ),
    compareParameterOrderIndependent(
      actual,
      "metadata.executionStats.dataCoverage.missingParameters",
      []
    ),
    compareValue(actual, "executionTimings.includedPhases.databaseQuery", true),
    compareValue(
      actual,
      "executionTimings.includedPhases.deterministicScore",
      true
    ),
    compareValue(actual, "executionTimings.includedPhases.embedding", false),
    compareValue(actual, "executionTimings.includedPhases.persistence", true),
    compareValue(
      actual,
      "executionTimings.includedPhases.serialization",
      false
    ),
    compareValue(actual, "executionTimings.includedPhases.summary", false),
  ];
  const scoreErrorSummary = buildScoreSummary(scoreComparisons);

  return {
    metricComparisons,
    passed:
      scoreErrorSummary.passed &&
      scoreComparisons.every(({ passed }) => passed) &&
      metricComparisons.every(({ passed }) => passed) &&
      structuralComparisons.every(({ passed }) => passed),
    scoreComparisons,
    scoreErrorSummary,
    structuralComparisons,
  };
};

export interface AnalysisTimingValues {
  databaseQueryMs: number;
  deterministicScoreMs: number;
  embeddingMs: number;
  overheadMs: number;
  persistenceMs: number;
  summaryMs: number;
  totalMs: number;
}

export const readAnalysisTimings = (actual: unknown): AnalysisTimingValues => {
  const prefix = "executionTimings";
  return {
    databaseQueryMs: numberAtPath(actual, `${prefix}.databaseQueryMs`),
    deterministicScoreMs: numberAtPath(
      actual,
      `${prefix}.deterministicScoreMs`
    ),
    embeddingMs: numberAtPath(actual, `${prefix}.embeddingMs`),
    overheadMs: numberAtPath(actual, `${prefix}.overheadMs`),
    persistenceMs: numberAtPath(actual, `${prefix}.persistenceMs`),
    summaryMs: numberAtPath(actual, `${prefix}.summaryMs`),
    totalMs: numberAtPath(actual, `${prefix}.totalMs`),
  };
};

export const emptyParameterNumbers = (): ParameterRecord<number> => ({
  dissolvedOxygen: 0,
  ph: 0,
  salinity: 0,
  temperature: 0,
});
