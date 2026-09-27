import { evaluateScenario } from "../oracle/scenario.ts";
import { artifactStore } from "../runtime/artifacts.ts";
import {
  readCount,
  type SqlClient,
  withSqlClient,
} from "../runtime/database.ts";
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
import { generateScenarioMeasurements } from "../seed/generator/scenario.ts";
import { loadModelConfig } from "../shared/config.ts";
import type { ModelConfig, ScoringScenarioConfig } from "../shared/types.ts";
import {
  type AnalysisComparisonResult,
  type AnalysisTimingValues,
  compareAnalysisWithOracle,
  readAnalysisTimings,
} from "../validation/analysis-comparison.ts";
import { compareMeasurementRecords } from "../validation/measurement-integrity.ts";

interface AnalysisPersistenceResult {
  analysisId: number | null;
  analysisResultDelta: number;
  embeddingCount: number;
  passed: boolean;
  summaryCount: number;
}

interface ScenarioAnalysisResult {
  comparison: AnalysisComparisonResult | null;
  databaseFixturePassed: boolean;
  httpDurationMs: number;
  httpStatus: number;
  passed: boolean;
  persistence: AnalysisPersistenceResult;
  responseText: string;
  scenarioId: string;
  timings: AnalysisTimingValues | null;
}

interface MissingParameterProbe {
  analysisResultDelta: number;
  expectedMissingParameter: "dissolvedOxygen";
  passed: boolean;
  responseText: string;
  status: number;
  window: { end: string; start: string };
}

export interface ValidateAnalysisOptions {
  allowRemoteTarget: boolean;
  analysisApiUrl: string;
  apiKey: string;
  databaseUrl: string;
  runId: string;
  selectorLabel: string;
}

export interface AnalysisValidationResult {
  aggregateScoreError: {
    comparisonCount: number;
    maximumAbsoluteError: number;
    meanAbsoluteError: number;
    passed: boolean;
  };
  databaseTarget: ReturnType<typeof sanitizeDatabaseUrl>;
  endedAt: string;
  httpTarget: ReturnType<typeof sanitizeHttpBaseUrl>;
  missingParameterProbe: MissingParameterProbe | null;
  passed: boolean;
  scenarios: ScenarioAnalysisResult[];
  schemaVersion: 1;
  startedAt: string;
}

const countAnalysisResults = async (
  client: SqlClient,
  pondId: number,
  start: string,
  end: string
): Promise<number> => {
  const rows = await client.query<{ row_count: unknown }>(
    "SELECT COUNT(*) AS row_count FROM analysis_results WHERE pond_id = $1 AND start_time = $2 AND end_time = $3",
    [pondId, start, end]
  );
  return readCount(rows[0]?.row_count, "analysisResults.rowCount");
};

const readPositiveId = (value: unknown, path: string): number => {
  const id = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error(`${path} must be a positive integer`);
  }
  return id;
};

const inspectAnalysisPersistence = async (
  client: SqlClient,
  scenario: ScoringScenarioConfig,
  countBefore: number
): Promise<AnalysisPersistenceResult> => {
  const countAfter = await countAnalysisResults(
    client,
    scenario.pondId,
    scenario.start,
    scenario.end
  );
  const analysisResultDelta = countAfter - countBefore;
  const rows = await client.query<{ id: unknown }>(
    "SELECT id FROM analysis_results WHERE pond_id = $1 AND start_time = $2 AND end_time = $3 ORDER BY id DESC LIMIT 1",
    [scenario.pondId, scenario.start, scenario.end]
  );
  const analysisId = rows[0]
    ? readPositiveId(rows[0].id, "analysisResult.id")
    : null;
  if (analysisId === null) {
    return {
      analysisId,
      analysisResultDelta,
      embeddingCount: 0,
      passed: false,
      summaryCount: 0,
    };
  }

  const [embeddingRows, summaryRows] = await Promise.all([
    client.query<{ row_count: unknown }>(
      "SELECT COUNT(*) AS row_count FROM analysis_embeddings WHERE analysis_id = $1",
      [analysisId]
    ),
    client.query<{ row_count: unknown }>(
      "SELECT COUNT(*) AS row_count FROM analysis_ai_summaries WHERE analysis_id = $1",
      [analysisId]
    ),
  ]);
  const embeddingCount = readCount(
    embeddingRows[0]?.row_count,
    "analysisEmbeddings.rowCount"
  );
  const summaryCount = readCount(
    summaryRows[0]?.row_count,
    "analysisAiSummaries.rowCount"
  );
  return {
    analysisId,
    analysisResultDelta,
    embeddingCount,
    passed:
      analysisResultDelta === 1 && embeddingCount === 0 && summaryCount === 0,
    summaryCount,
  };
};

const callAnalysis = async (
  scenario: ScoringScenarioConfig,
  target: ReturnType<typeof sanitizeHttpBaseUrl>,
  options: ValidateAnalysisOptions
): Promise<HttpRequestResult> =>
  await executeHttpRequest({
    apiKey: options.apiKey,
    body: {
      endDate: scenario.end,
      generateAiSummary: false,
      generateEmbedding: false,
      maximumContinuityGapSeconds: scenario.maximumContinuityGapSeconds ?? 20,
      startDate: scenario.start,
      window: "custom",
    },
    method: "POST",
    runId: options.runId,
    url: `${target.baseUrl}/analyses/ponds/${scenario.pondId}`,
  });

const validateScenario = async (
  client: SqlClient,
  scenario: ScoringScenarioConfig,
  model: ModelConfig,
  target: ReturnType<typeof sanitizeHttpBaseUrl>,
  options: ValidateAnalysisOptions
): Promise<ScenarioAnalysisResult> => {
  const expectedMeasurements = generateScenarioMeasurements(scenario, model);
  const actualMeasurements = await readMeasurementsInWindow(
    client,
    scenario.pondId,
    scenario.start,
    scenario.end
  );
  const fixtureComparison = compareMeasurementRecords(
    expectedMeasurements,
    actualMeasurements
  );
  const countBefore = await countAnalysisResults(
    client,
    scenario.pondId,
    scenario.start,
    scenario.end
  );
  const response = await callAnalysis(scenario, target, options);
  const oracle = evaluateScenario(scenario, model).evaluation;
  let comparison: AnalysisComparisonResult | null = null;
  let timings: AnalysisTimingValues | null = null;
  if (response.status === 200) {
    comparison = compareAnalysisWithOracle(
      response.responseBody,
      oracle,
      model,
      {
        expectedPondId: scenario.pondId,
      }
    );
    timings = readAnalysisTimings(response.responseBody);
  }
  const persistence = await inspectAnalysisPersistence(
    client,
    scenario,
    countBefore
  );
  const result: ScenarioAnalysisResult = {
    comparison,
    databaseFixturePassed: fixtureComparison.passed,
    httpDurationMs: response.durationMs,
    httpStatus: response.status,
    passed:
      fixtureComparison.passed &&
      response.status === 200 &&
      comparison?.passed === true &&
      persistence.passed,
    persistence,
    responseText: boundedResponseText(response.responseText),
    scenarioId: scenario.id,
    timings,
  };
  await artifactStore.writeJson(
    options.runId,
    `correctness/analysis-${scenario.id.toLowerCase()}.json`,
    {
      ...result,
      fixtureComparison,
      oracle,
      response: response.responseBody,
    }
  );
  return result;
};

const runMissingParameterProbe = async (
  client: SqlClient,
  c6b: ScoringScenarioConfig,
  target: ReturnType<typeof sanitizeHttpBaseUrl>,
  options: ValidateAnalysisOptions
): Promise<MissingParameterProbe> => {
  const startEpoch = Date.parse(c6b.start);
  const start = new Date(startEpoch + 30_000).toISOString();
  const end = new Date(startEpoch + 60_000).toISOString();
  const before = await countAnalysisResults(client, c6b.pondId, start, end);
  const response = await executeHttpRequest({
    apiKey: options.apiKey,
    body: {
      endDate: end,
      generateAiSummary: false,
      generateEmbedding: false,
      maximumContinuityGapSeconds: 20,
      startDate: start,
      window: "custom",
    },
    method: "POST",
    runId: options.runId,
    url: `${target.baseUrl}/analyses/ponds/${c6b.pondId}`,
  });
  const after = await countAnalysisResults(client, c6b.pondId, start, end);
  const responseText = boundedResponseText(response.responseText);
  return {
    analysisResultDelta: after - before,
    expectedMissingParameter: "dissolvedOxygen",
    passed:
      response.status === 400 &&
      after === before &&
      responseText.includes("dissolvedOxygen"),
    responseText,
    status: response.status,
    window: { end, start },
  };
};

const aggregateScoreErrors = (
  results: readonly ScenarioAnalysisResult[]
): AnalysisValidationResult["aggregateScoreError"] => {
  const errors = results.flatMap(
    ({ comparison }) =>
      comparison?.scoreComparisons.map(({ absoluteError }) => absoluteError) ??
      []
  );
  let sum = 0;
  let maximumAbsoluteError = 0;
  for (const error of errors) {
    sum += error;
    maximumAbsoluteError = Math.max(maximumAbsoluteError, error);
  }
  const meanAbsoluteError =
    errors.length === 0 ? Number.NaN : sum / errors.length;
  return {
    comparisonCount: errors.length,
    maximumAbsoluteError,
    meanAbsoluteError,
    passed:
      errors.length > 0 &&
      meanAbsoluteError <= 0.01 &&
      maximumAbsoluteError <= 0.05,
  };
};

const selectorArtifactLabel = (selectorLabel: string): string =>
  selectorLabel
    .toLowerCase()
    .replaceAll(",", "-")
    .replaceAll(/[^a-z0-9-]/g, "");

export const validateAnalysisScenarios = async (
  scenarios: readonly ScoringScenarioConfig[],
  options: ValidateAnalysisOptions
): Promise<AnalysisValidationResult> => {
  const startedAt = new Date().toISOString();
  const target = sanitizeHttpBaseUrl(options.analysisApiUrl);
  assertHttpTargetAllowed(target, options.allowRemoteTarget);
  const databaseTarget = sanitizeDatabaseUrl(options.databaseUrl);
  await artifactStore.requireRun(options.runId);
  const model = await loadModelConfig();

  const execution = await withSqlClient(options.databaseUrl, async (client) => {
    const scenarioResults: ScenarioAnalysisResult[] = [];
    for (const scenario of scenarios) {
      // biome-ignore lint/performance/noAwaitInLoops: Scenario requests and persistence checks are intentionally isolated.
      const scenarioResult = await validateScenario(
        client,
        scenario,
        model,
        target,
        options
      );
      scenarioResults.push(scenarioResult);
    }
    const c6b = scenarios.find(({ id }) => id === "C6-B");
    const missingParameterProbe = c6b
      ? await runMissingParameterProbe(client, c6b, target, options)
      : null;
    return { missingParameterProbe, scenarioResults };
  });
  const aggregateScoreError = aggregateScoreErrors(execution.scenarioResults);
  const result: AnalysisValidationResult = {
    aggregateScoreError,
    databaseTarget,
    endedAt: new Date().toISOString(),
    httpTarget: target,
    missingParameterProbe: execution.missingParameterProbe,
    passed:
      execution.scenarioResults.every(({ passed }) => passed) &&
      (execution.missingParameterProbe?.passed ?? true) &&
      aggregateScoreError.passed,
    scenarios: execution.scenarioResults,
    schemaVersion: 1,
    startedAt,
  };
  const label = selectorArtifactLabel(options.selectorLabel);
  await artifactStore.writeJson(
    options.runId,
    `correctness/analysis-summary-${label}.json`,
    result
  );
  return result;
};
