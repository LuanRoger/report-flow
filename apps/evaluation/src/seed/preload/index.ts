import { createHash } from "node:crypto";
import { artifactStore } from "../../runtime/artifacts.ts";
import { type SqlClient, withSqlClient } from "../../runtime/database.ts";
import {
  assertDestructiveDatabaseTarget,
  type SanitizedDatabaseTarget,
} from "../../runtime/environment.ts";
import {
  datasetPondCycles,
  ensurePondsAndCycles,
  insertMeasurementBatch,
  inspectMeasurementIntegrity,
  type MeasurementIntegrityResult,
  maximumSafeMeasurementBatchSize,
} from "../../runtime/measurements.ts";
import { canonicalJson, checksumJson } from "../../shared/json.ts";
import {
  parseUtcTimestamp,
  timestampByIndex,
  toUtcIsoString,
} from "../../shared/time.ts";
import type {
  DatasetConfig,
  MeasurementRecord,
  ModelConfig,
} from "../../shared/types.ts";
import {
  buildDatasetPlanSummary,
  type DatasetPlanSummary,
  generateSeedRecords,
} from "../generator/generate.ts";

const RESET_STATEMENT =
  "TRUNCATE TABLE message_sources, messages, chats, analysis_ai_summaries, analysis_embeddings, analysis_results, measurements, pond_cycles, ponds RESTART IDENTITY CASCADE";

export interface PreloadOptions {
  confirmReset: boolean;
  databaseUrl: string;
  runId: string;
}

export interface PreloadResult {
  batchCount: number;
  configChecksum: string;
  databaseTarget: SanitizedDatabaseTarget;
  datasetId: string;
  effectiveBatchSize: number;
  endedAt: string;
  expectedRowCount: number;
  generatedChecksum: string;
  generatedRowCount: number;
  integrity: MeasurementIntegrityResult;
  passed: boolean;
  plan: DatasetPlanSummary;
  resetPerformed: true;
  schemaVersion: 1;
  startedAt: string;
}

interface DatabasePreloadResult {
  batchCount: number;
  configChecksum: string;
  datasetId: string;
  effectiveBatchSize: number;
  expectedRowCount: number;
  generatedChecksum: string;
  generatedRowCount: number;
  integrity: MeasurementIntegrityResult;
  plan: DatasetPlanSummary;
  resetPerformed: true;
}

const flushBatch = async (
  client: SqlClient,
  batch: MeasurementRecord[],
  sourceFile: string
): Promise<void> => {
  if (batch.length === 0) {
    return;
  }
  await insertMeasurementBatch(client, batch, sourceFile);
  batch.length = 0;
};

const expectedLastTimestamp = (
  config: DatasetConfig,
  plan: DatasetPlanSummary
): string =>
  toUtcIsoString(
    timestampByIndex(
      parseUtcTimestamp(config.start, `${config.id}.start`),
      plan.collectionInstantCount - 1,
      config.intervalSeconds * 1000
    )
  );

const runDatabasePreload = async (
  client: SqlClient,
  config: DatasetConfig,
  model: ModelConfig
): Promise<DatabasePreloadResult> => {
  const plan = buildDatasetPlanSummary(config, model);
  const effectiveBatchSize = Math.min(
    config.batchSize,
    maximumSafeMeasurementBatchSize()
  );
  const sourceFile = `evaluation:${config.id}`;
  const checksum = createHash("sha256");
  const batch: MeasurementRecord[] = [];
  let batchCount = 0;
  let generatedRowCount = 0;

  await client.query(RESET_STATEMENT);
  await ensurePondsAndCycles(client, datasetPondCycles(config));

  for (const record of generateSeedRecords(config, model)) {
    checksum.update(`${canonicalJson(record)}\n`);
    batch.push(record);
    generatedRowCount += 1;

    if (batch.length >= effectiveBatchSize) {
      // biome-ignore lint/performance/noAwaitInLoops: Awaiting each batch bounds memory and database pressure for very large datasets.
      await flushBatch(client, batch, sourceFile);
      batchCount += 1;
    }
  }
  if (batch.length > 0) {
    await flushBatch(client, batch, sourceFile);
    batchCount += 1;
  }

  return {
    batchCount,
    configChecksum: checksumJson(config),
    datasetId: config.id,
    effectiveBatchSize,
    expectedRowCount: config.expectedRowCount,
    generatedChecksum: `sha256:${checksum.digest("hex")}`,
    generatedRowCount,
    integrity: await inspectMeasurementIntegrity(client),
    plan,
    resetPerformed: true,
  };
};

const preloadPassed = (
  result: DatabasePreloadResult,
  config: DatasetConfig
): boolean => {
  const expectedPerParameter = config.expectedRowCount / 4;
  return (
    result.generatedRowCount === config.expectedRowCount &&
    result.integrity.rowCount === config.expectedRowCount &&
    result.integrity.duplicateIdentityCount === 0 &&
    result.integrity.firstRecordedAt === config.start &&
    result.integrity.lastRecordedAt ===
      expectedLastTimestamp(config, result.plan) &&
    Object.values(result.integrity.perParameterCount).every(
      (count) => count === expectedPerParameter
    )
  );
};

export const preloadDataset = async (
  config: DatasetConfig,
  model: ModelConfig,
  options: PreloadOptions
): Promise<PreloadResult> => {
  const startedAt = new Date().toISOString();
  const databaseTarget = assertDestructiveDatabaseTarget(options.databaseUrl, {
    confirmed: options.confirmReset,
  });
  await artifactStore.requireRun(options.runId);

  const databaseResult = await withSqlClient(
    options.databaseUrl,
    async (client) => await runDatabasePreload(client, config, model)
  );
  const passed = preloadPassed(databaseResult, config);
  const result: PreloadResult = {
    ...databaseResult,
    databaseTarget,
    endedAt: new Date().toISOString(),
    passed,
    schemaVersion: 1,
    startedAt,
  };

  await artifactStore.writeJson(
    options.runId,
    `seeds/preload-${config.id}.json`,
    result
  );
  await artifactStore.updateManifest(options.runId, (manifest) => ({
    ...manifest,
    events: [
      ...(Array.isArray(manifest.events) ? manifest.events : []),
      {
        at: result.endedAt,
        database: databaseTarget,
        datasetId: config.id,
        destructiveReset: true,
        passed,
        stage: "preload",
      },
    ],
  }));

  return result;
};
