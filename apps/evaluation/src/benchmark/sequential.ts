import { evaluatePondMeasurements } from "../oracle/evaluate.ts";
import { artifactStore } from "../runtime/artifacts.ts";
import { type SqlClient, withSqlClient } from "../runtime/database.ts";
import {
  assertHttpTargetAllowed,
  sanitizeDatabaseUrl,
  sanitizeHttpBaseUrl,
} from "../runtime/environment.ts";
import {
  boundedResponseText,
  executeHttpRequest,
  type HttpRequestResult,
} from "../runtime/http.ts";
import { readMeasurementsInWindow } from "../runtime/measurements.ts";
import {
  type DistributionSummary,
  summarizeDistribution,
} from "../runtime/statistics.ts";
import { loadModelConfig } from "../shared/config.ts";
import type { ModelConfig } from "../shared/types.ts";
import {
  type AnalysisComparisonResult,
  type AnalysisTimingValues,
  compareAnalysisWithOracle,
  readAnalysisTimings,
} from "../validation/analysis-comparison.ts";
import {
  type BenchmarkWindow,
  type MeasurementBounds,
  readMeasurementBounds,
  resolveBenchmarkWindow,
} from "./windows.ts";

interface SequentialSample {
  comparison: AnalysisComparisonResult | null;
  httpDurationMs: number;
  index: number;
  responseText: string | null;
  status: number;
  timings: AnalysisTimingValues | null;
}

interface TimingDistributions {
  databaseQueryMs: DistributionSummary;
  deterministicScoreMs: DistributionSummary;
  embeddingMs: DistributionSummary;
  httpDurationMs: DistributionSummary;
  overheadMs: DistributionSummary;
  persistenceMs: DistributionSummary;
  summaryMs: DistributionSummary;
  totalMs: DistributionSummary;
}

interface SequentialCaseResult {
  bounds: MeasurementBounds;
  derivedRates: {
    databaseRowsReturnedPerSecondAtMedian: number | null;
    rowsExamined: null;
    rowsExaminedReason: string;
    scoreMeasurementsPerSecondAtMedian: number | null;
  };
  expectedFinalScore: number;
  measurementsScored: number;
  passed: boolean;
  pondId: number;
  samples: SequentialSample[];
  timingDistributions: TimingDistributions;
  warmupStatuses: number[];
  window: BenchmarkWindow;
}

export interface SequentialBenchmarkOptions {
  allowRemoteTarget: boolean;
  analysisApiUrl: string;
  apiKey: string;
  databaseUrl: string;
  end?: string;
  measuredSamples: number;
  pondId: number;
  runId: string;
  warmupSamples: number;
  windowsInDays: readonly number[];
}

export interface SequentialBenchmarkResult {
  cases: SequentialCaseResult[];
  databaseTarget: ReturnType<typeof sanitizeDatabaseUrl>;
  endedAt: string;
  httpTarget: ReturnType<typeof sanitizeHttpBaseUrl>;
  passed: boolean;
  profile: {
    cacheClassification: "warm";
    embeddingIncluded: false;
    measuredSamples: number;
    persistenceIncluded: true;
    summaryIncluded: false;
    warmupSamples: number;
  };
  schemaVersion: 1;
  startedAt: string;
}

const PERFORMANCE_CONTINUITY_GAP_SECONDS = 300;

const callAnalysis = async (
  target: ReturnType<typeof sanitizeHttpBaseUrl>,
  options: SequentialBenchmarkOptions,
  window: BenchmarkWindow
): Promise<HttpRequestResult> =>
  await executeHttpRequest({
    apiKey: options.apiKey,
    body: {
      endDate: window.end,
      generateAiSummary: false,
      generateEmbedding: false,
      maximumContinuityGapSeconds: PERFORMANCE_CONTINUITY_GAP_SECONDS,
      startDate: window.start,
      window: "custom",
    },
    method: "POST",
    runId: options.runId,
    timeoutMs: 120_000,
    url: `${target.baseUrl}/analyses/ponds/${options.pondId}`,
  });

const buildTimingDistributions = (
  samples: readonly SequentialSample[]
): TimingDistributions => {
  const completeSamples = samples.filter(
    (sample): sample is SequentialSample & { timings: AnalysisTimingValues } =>
      sample.timings !== null
  );
  if (completeSamples.length === 0) {
    throw new Error("Sequential benchmark produced no complete timing samples");
  }
  const timingValues = completeSamples.map(({ timings }) => timings);
  return {
    databaseQueryMs: summarizeDistribution(
      timingValues.map(({ databaseQueryMs }) => databaseQueryMs)
    ),
    deterministicScoreMs: summarizeDistribution(
      timingValues.map(({ deterministicScoreMs }) => deterministicScoreMs)
    ),
    embeddingMs: summarizeDistribution(
      timingValues.map(({ embeddingMs }) => embeddingMs)
    ),
    httpDurationMs: summarizeDistribution(
      completeSamples.map(({ httpDurationMs }) => httpDurationMs)
    ),
    overheadMs: summarizeDistribution(
      timingValues.map(({ overheadMs }) => overheadMs)
    ),
    persistenceMs: summarizeDistribution(
      timingValues.map(({ persistenceMs }) => persistenceMs)
    ),
    summaryMs: summarizeDistribution(
      timingValues.map(({ summaryMs }) => summaryMs)
    ),
    totalMs: summarizeDistribution(timingValues.map(({ totalMs }) => totalMs)),
  };
};

const measureCase = async (
  client: SqlClient,
  bounds: MeasurementBounds,
  window: BenchmarkWindow,
  model: ModelConfig,
  target: ReturnType<typeof sanitizeHttpBaseUrl>,
  options: SequentialBenchmarkOptions
): Promise<SequentialCaseResult> => {
  const measurements = await readMeasurementsInWindow(
    client,
    options.pondId,
    window.start,
    window.end
  );
  const oracle = evaluatePondMeasurements(
    measurements.map(({ parameterCode, recordedAt, value }) => ({
      parameterCode,
      recordedAt,
      value,
    })),
    {
      end: window.end,
      maximumContinuityGapSeconds: PERFORMANCE_CONTINUITY_GAP_SECONDS,
      start: window.start,
    },
    model
  );
  if (oracle.finalScore === null) {
    throw new Error(
      "Benchmark window has no complete independent-oracle score"
    );
  }

  const warmupStatuses: number[] = [];
  let warmupIndex = 0;
  while (warmupIndex < options.warmupSamples) {
    // biome-ignore lint/performance/noAwaitInLoops: Sequential requests are the defining property of this microbenchmark.
    const response = await callAnalysis(target, options, window);
    warmupStatuses.push(response.status);
    if (response.status !== 200) {
      throw new Error(
        `Warm-up ${warmupIndex + 1} for ${window.days}d failed with HTTP ${response.status}: ${boundedResponseText(response.responseText)}`
      );
    }
    warmupIndex += 1;
  }

  const samples: SequentialSample[] = [];
  let sampleIndex = 0;
  while (sampleIndex < options.measuredSamples) {
    // biome-ignore lint/performance/noAwaitInLoops: Parallel requests would turn this into a concurrency benchmark.
    const response = await callAnalysis(target, options, window);
    const comparison =
      response.status === 200
        ? compareAnalysisWithOracle(response.responseBody, oracle, model, {
            expectedPondId: options.pondId,
          })
        : null;
    const timings =
      response.status === 200
        ? readAnalysisTimings(response.responseBody)
        : null;
    samples.push({
      comparison,
      httpDurationMs: response.durationMs,
      index: sampleIndex + 1,
      responseText:
        response.status === 200
          ? null
          : boundedResponseText(response.responseText),
      status: response.status,
      timings,
    });
    sampleIndex += 1;
  }

  const timingDistributions = buildTimingDistributions(samples);
  const medianDatabaseSeconds =
    timingDistributions.databaseQueryMs.median / 1000;
  const medianScoreSeconds =
    timingDistributions.deterministicScoreMs.median / 1000;
  return {
    bounds,
    derivedRates: {
      databaseRowsReturnedPerSecondAtMedian:
        medianDatabaseSeconds === 0
          ? null
          : measurements.length / medianDatabaseSeconds,
      rowsExamined: null,
      rowsExaminedReason:
        "The HTTP path reports rows returned; rows examined is collected from the separate EXPLAIN artifact",
      scoreMeasurementsPerSecondAtMedian:
        medianScoreSeconds === 0
          ? null
          : measurements.length / medianScoreSeconds,
    },
    expectedFinalScore: oracle.finalScore,
    measurementsScored: measurements.length,
    passed:
      warmupStatuses.every((status) => status === 200) &&
      samples.length === options.measuredSamples &&
      samples.every(
        ({ comparison, status }) =>
          status === 200 && comparison?.passed === true
      ),
    pondId: options.pondId,
    samples,
    timingDistributions,
    warmupStatuses,
    window,
  };
};

export const runSequentialBenchmark = async (
  options: SequentialBenchmarkOptions
): Promise<SequentialBenchmarkResult> => {
  const startedAt = new Date().toISOString();
  const target = sanitizeHttpBaseUrl(options.analysisApiUrl);
  assertHttpTargetAllowed(target, options.allowRemoteTarget);
  const databaseTarget = sanitizeDatabaseUrl(options.databaseUrl);
  await artifactStore.requireRun(options.runId);
  const model = await loadModelConfig();

  const cases = await withSqlClient(options.databaseUrl, async (client) => {
    const bounds = await readMeasurementBounds(client, options.pondId);
    const results: SequentialCaseResult[] = [];
    for (const days of options.windowsInDays) {
      const window = resolveBenchmarkWindow(bounds, days, options.end);
      // biome-ignore lint/performance/noAwaitInLoops: Window cases must not contend with one another.
      const caseResult = await measureCase(
        client,
        bounds,
        window,
        model,
        target,
        options
      );
      results.push(caseResult);
    }
    return results;
  });
  const result: SequentialBenchmarkResult = {
    cases,
    databaseTarget,
    endedAt: new Date().toISOString(),
    httpTarget: target,
    passed: cases.every(({ passed }) => passed),
    profile: {
      cacheClassification: "warm",
      embeddingIncluded: false,
      measuredSamples: options.measuredSamples,
      persistenceIncluded: true,
      summaryIncluded: false,
      warmupSamples: options.warmupSamples,
    },
    schemaVersion: 1,
    startedAt,
  };
  await artifactStore.writeJson(
    options.runId,
    `performance/sequential/pond-${options.pondId}-${options.windowsInDays.join("-")}d.json`,
    result
  );
  return result;
};
