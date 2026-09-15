import { artifactStore, type NdjsonWriter } from "../runtime/artifacts.ts";
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
import {
  countAllMeasurements,
  countMeasurementsInWindow,
  ensurePondsAndCycles,
  type PondCycleDefinition,
  readMeasurementsInWindow,
} from "../runtime/measurements.ts";
import { generateScenarioMeasurements } from "../seed/generator/scenario.ts";
import { loadInvalidPayloadConfig, loadModelConfig } from "../shared/config.ts";
import type {
  InvalidPayloadConfig,
  InvalidPayloadFixture,
  ScoringScenarioConfig,
} from "../shared/types.ts";
import { compareMeasurementRecords } from "../validation/measurement-integrity.ts";

interface StatusCounts {
  [status: string]: number;
}

interface ScenarioIngestionResult {
  acceptedCount: number;
  expectedCount: number;
  passed: boolean;
  persistedCountAfter: number;
  persistedCountBefore: number;
  persistenceComparison: ReturnType<typeof compareMeasurementRecords>;
  rejectedCount: number;
  scenarioId: string;
  statusCounts: StatusCounts;
}

interface InvalidFixtureResult {
  actualPersistenceDelta: number;
  expectedPersistenceDelta: number;
  fixtureId: string;
  passed: boolean;
  statuses: number[];
}

interface C7Result {
  acceptedControls: InvalidFixtureResult[];
  invalidCases: InvalidFixtureResult[];
  invalidRejectionRate: number;
  passed: boolean;
}

export interface ValidateIngestionOptions {
  allowRemoteTarget: boolean;
  apiKey: string;
  databaseUrl: string;
  ingestApiUrl: string;
  runId: string;
  selectorLabel: string;
}

export interface IngestionValidationResult {
  c7: C7Result | null;
  databaseTarget: ReturnType<typeof sanitizeDatabaseUrl>;
  endedAt: string;
  httpTarget: ReturnType<typeof sanitizeHttpBaseUrl>;
  passed: boolean;
  scenarios: ScenarioIngestionResult[];
  schemaVersion: 1;
  startedAt: string;
  validPersistenceRatio: number;
}

const incrementStatus = (counts: StatusCounts, status: number): void => {
  const key = String(status);
  counts[key] = (counts[key] ?? 0) + 1;
};

const functionalCycles = (
  scenarios: readonly ScoringScenarioConfig[],
  includeC7: boolean
): PondCycleDefinition[] => {
  const byCycle = new Map<number, PondCycleDefinition>();
  for (const scenario of scenarios) {
    const existing = byCycle.get(scenario.cycleId);
    const startDate = scenario.start.slice(0, 10);
    const endDate = scenario.end.slice(0, 10);
    if (!existing) {
      byCycle.set(scenario.cycleId, {
        cycleId: scenario.cycleId,
        endDate,
        pondId: scenario.pondId,
        startDate,
      });
      continue;
    }
    if (existing.pondId !== scenario.pondId) {
      throw new Error(
        `Cycle ${scenario.cycleId} has conflicting pond fixtures`
      );
    }
    existing.startDate =
      existing.startDate < startDate ? existing.startDate : startDate;
    existing.endDate = existing.endDate > endDate ? existing.endDate : endDate;
  }

  if (includeC7) {
    const endDate = "2026-01-11";
    const startDate = "2026-01-10";
    if (!byCycle.has(1)) {
      byCycle.set(1, { cycleId: 1, endDate, pondId: 1, startDate });
    }
    byCycle.set(2, { cycleId: 2, endDate, pondId: 2, startDate });
  }
  return [...byCycle.values()].sort(
    (left, right) => left.cycleId - right.cycleId
  );
};

const requestArtifact = async (
  writer: NdjsonWriter,
  request: {
    body?: unknown;
    caseId: string;
    rawBody?: string;
    sequence: number;
  },
  options: ValidateIngestionOptions,
  endpoint: string
): Promise<HttpRequestResult> => {
  const result = await executeHttpRequest({
    apiKey: options.apiKey,
    body: request.body,
    method: "POST",
    rawBody: request.rawBody,
    runId: options.runId,
    url: endpoint,
  });
  await writer.append({
    accepted: result.ok,
    caseId: request.caseId,
    durationMs: result.durationMs,
    responseText: boundedResponseText(result.responseText),
    sequence: request.sequence,
    status: result.status,
  });
  return result;
};

const validateScenario = async (
  client: SqlClient,
  scenario: ScoringScenarioConfig,
  writer: NdjsonWriter,
  endpoint: string,
  options: ValidateIngestionOptions
): Promise<ScenarioIngestionResult> => {
  const model = await loadModelConfig();
  const records = generateScenarioMeasurements(scenario, model);
  const persistedCountBefore = await countMeasurementsInWindow(
    client,
    scenario.pondId,
    scenario.start,
    scenario.end
  );
  if (persistedCountBefore !== 0) {
    throw new Error(
      `${scenario.id} window already contains ${persistedCountBefore} measurements; functional ingestion refuses to overwrite or merge fixtures`
    );
  }

  const statusCounts: StatusCounts = {};
  let acceptedCount = 0;
  let rejectedCount = 0;
  let sequence = 0;
  for (const record of records) {
    // biome-ignore lint/performance/noAwaitInLoops: Functional ingestion preserves deterministic request and artifact order.
    const result = await requestArtifact(
      writer,
      { body: record, caseId: scenario.id, sequence },
      options,
      endpoint
    );
    incrementStatus(statusCounts, result.status);
    if (result.status === 201) {
      acceptedCount += 1;
    } else {
      rejectedCount += 1;
    }
    sequence += 1;
  }

  const persistedCountAfter = await countMeasurementsInWindow(
    client,
    scenario.pondId,
    scenario.start,
    scenario.end
  );
  const persistedRecords = await readMeasurementsInWindow(
    client,
    scenario.pondId,
    scenario.start,
    scenario.end
  );
  const persistenceComparison = compareMeasurementRecords(
    records,
    persistedRecords
  );
  return {
    acceptedCount,
    expectedCount: records.length,
    passed:
      acceptedCount === records.length &&
      rejectedCount === 0 &&
      persistedCountAfter - persistedCountBefore === records.length &&
      persistenceComparison.passed,
    persistedCountAfter,
    persistedCountBefore,
    persistenceComparison,
    rejectedCount,
    scenarioId: scenario.id,
    statusCounts,
  };
};

const executeFixtureRequests = async (
  fixture: InvalidPayloadFixture,
  writer: NdjsonWriter,
  endpoint: string,
  options: ValidateIngestionOptions
): Promise<number[]> => {
  const requests = fixture.requests ?? [fixture.body];
  const statuses: number[] = [];
  let sequence = 0;
  for (const body of requests) {
    // biome-ignore lint/performance/noAwaitInLoops: Duplicate identity validation requires ordered requests.
    const result = await requestArtifact(
      writer,
      {
        body,
        caseId: `C7:${fixture.id}`,
        rawBody: fixture.rawBody,
        sequence,
      },
      options,
      endpoint
    );
    statuses.push(result.status);
    sequence += 1;
  }
  return statuses;
};

const fixtureStatusPassed = (
  fixture: InvalidPayloadFixture,
  statuses: readonly number[]
): boolean => {
  if (fixture.requests) {
    return (
      statuses[0] === 201 && statuses.slice(1).every((status) => status >= 400)
    );
  }
  return statuses.length === 1 && (statuses[0] ?? 0) >= 400;
};

const validateC7 = async (
  client: SqlClient,
  config: InvalidPayloadConfig,
  writer: NdjsonWriter,
  endpoint: string,
  options: ValidateIngestionOptions
): Promise<C7Result> => {
  const invalidCases: InvalidFixtureResult[] = [];
  for (const fixture of config.cases) {
    // biome-ignore lint/performance/noAwaitInLoops: Each fixture needs isolated before/after persistence counts.
    const before = await countAllMeasurements(client);
    const statuses = await executeFixtureRequests(
      fixture,
      writer,
      endpoint,
      options
    );
    const after = await countAllMeasurements(client);
    const actualPersistenceDelta = after - before;
    invalidCases.push({
      actualPersistenceDelta,
      expectedPersistenceDelta: fixture.expectedPersistenceDelta,
      fixtureId: fixture.id,
      passed:
        fixtureStatusPassed(fixture, statuses) &&
        actualPersistenceDelta === fixture.expectedPersistenceDelta,
      statuses,
    });
  }

  const acceptedControls: InvalidFixtureResult[] = [];
  for (const control of config.acceptedControls) {
    // biome-ignore lint/performance/noAwaitInLoops: Each control needs isolated before/after persistence counts.
    const before = await countAllMeasurements(client);
    const result = await requestArtifact(
      writer,
      { body: control.body, caseId: `C7:${control.id}`, sequence: 0 },
      options,
      endpoint
    );
    const after = await countAllMeasurements(client);
    const actualPersistenceDelta = after - before;
    acceptedControls.push({
      actualPersistenceDelta,
      expectedPersistenceDelta: control.expectedPersistenceDelta,
      fixtureId: control.id,
      passed:
        result.status === 201 &&
        actualPersistenceDelta === control.expectedPersistenceDelta,
      statuses: [result.status],
    });
  }

  const rejectedCases = invalidCases.filter(({ passed }) => passed).length;
  return {
    acceptedControls,
    invalidCases,
    invalidRejectionRate:
      invalidCases.length === 0 ? 0 : rejectedCases / invalidCases.length,
    passed:
      invalidCases.every(({ passed }) => passed) &&
      acceptedControls.every(({ passed }) => passed),
  };
};

const selectorArtifactLabel = (selectorLabel: string): string =>
  selectorLabel
    .toLowerCase()
    .replaceAll(",", "-")
    .replaceAll(/[^a-z0-9-]/g, "");

export const validateHttpIngestion = async (
  scenarios: readonly ScoringScenarioConfig[],
  includeC7: boolean,
  options: ValidateIngestionOptions
): Promise<IngestionValidationResult> => {
  const startedAt = new Date().toISOString();
  const httpTarget = sanitizeHttpBaseUrl(options.ingestApiUrl);
  assertHttpTargetAllowed(httpTarget, options.allowRemoteTarget);
  const databaseTarget = sanitizeDatabaseUrl(options.databaseUrl);
  await artifactStore.requireRun(options.runId);
  const label = selectorArtifactLabel(options.selectorLabel);
  const writer = await artifactStore.openNdjson(
    options.runId,
    `ingestion/http-requests-${label}.ndjson`
  );
  const endpoint = `${httpTarget.baseUrl}/ingest/manual`;

  try {
    const execution = await withSqlClient(
      options.databaseUrl,
      async (client) => {
        await ensurePondsAndCycles(
          client,
          functionalCycles(scenarios, includeC7)
        );
        const scenarioResults: ScenarioIngestionResult[] = [];
        for (const scenario of scenarios) {
          // biome-ignore lint/performance/noAwaitInLoops: Scenario windows are validated without concurrent request interference.
          const scenarioResult = await validateScenario(
            client,
            scenario,
            writer,
            endpoint,
            options
          );
          scenarioResults.push(scenarioResult);
        }
        const c7Config = includeC7 ? await loadInvalidPayloadConfig() : null;
        const c7 = c7Config
          ? await validateC7(client, c7Config, writer, endpoint, options)
          : null;
        return { c7, scenarioResults };
      }
    );
    const sentValidCount = execution.scenarioResults.reduce(
      (sum, scenario) => sum + scenario.expectedCount,
      0
    );
    const persistedValidCount = execution.scenarioResults.reduce(
      (sum, scenario) =>
        sum + (scenario.persistedCountAfter - scenario.persistedCountBefore),
      0
    );
    const validPersistenceRatio =
      sentValidCount === 0 ? 1 : persistedValidCount / sentValidCount;
    const result: IngestionValidationResult = {
      c7: execution.c7,
      databaseTarget,
      endedAt: new Date().toISOString(),
      httpTarget,
      passed:
        execution.scenarioResults.every(({ passed }) => passed) &&
        (execution.c7?.passed ?? true) &&
        validPersistenceRatio === 1,
      scenarios: execution.scenarioResults,
      schemaVersion: 1,
      startedAt,
      validPersistenceRatio,
    };
    await writer.close();
    await artifactStore.writeJson(
      options.runId,
      `ingestion/summary-${label}.json`,
      result
    );
    return result;
  } catch (error) {
    await writer.close();
    throw error;
  }
};
