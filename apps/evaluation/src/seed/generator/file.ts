import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, open, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  canonicalJson,
  checksumJson,
  stablePrettyJson,
} from "../../shared/json.ts";
import type {
  DatasetConfig,
  ModelConfig,
  ParameterRecord,
} from "../../shared/types.ts";
import {
  buildDatasetPlanSummary,
  emptyParameterCounts,
  generateSeedRecords,
} from "./generate.ts";

export interface GeneratedSeedSummary {
  batchSize: number;
  configChecksum: string;
  cyclesPerPond: number;
  datasetId: string;
  end: string;
  expectedRowCount: number;
  generatedRowCount: number;
  generationPlanChecksum: string;
  generatorVersion: string;
  intervalSeconds: number;
  maximumGeneratedTimestamp: string;
  minimumGeneratedTimestamp: string;
  modelConfigChecksum: string;
  outputChecksum: string;
  outputFormat: "ndjson";
  outputPath: string;
  perParameterCounts: ParameterRecord<number>;
  pondCount: number;
  prngAlgorithm: string;
  scenarioId: string;
  schemaVersion: 1;
  seed: number;
  sourceType: string;
  start: string;
}

const assertPathAvailable = (path: string): void => {
  if (existsSync(path)) {
    throw new Error(`Refusing to overwrite existing path: ${path}`);
  }
};

export const generateSeedFile = async (
  config: DatasetConfig,
  model: ModelConfig,
  outputPath: string
): Promise<GeneratedSeedSummary> => {
  const summaryPath = `${outputPath}.summary.json`;
  const partialOutputPath = `${outputPath}.partial`;
  const partialSummaryPath = `${summaryPath}.partial`;
  await mkdir(dirname(outputPath), { recursive: true });
  for (const path of [
    outputPath,
    summaryPath,
    partialOutputPath,
    partialSummaryPath,
  ]) {
    assertPathAvailable(path);
  }

  const plan = buildDatasetPlanSummary(config, model);
  const outputHash = createHash("sha256");
  const parameterCounts = emptyParameterCounts();
  const outputFile = await open(partialOutputPath, "wx");
  const batch: string[] = [];
  let generatedRowCount = 0;
  let minimumGeneratedTimestamp: string | undefined;
  let maximumGeneratedTimestamp: string | undefined;

  try {
    for (const record of generateSeedRecords(config, model)) {
      const line = `${canonicalJson(record)}\n`;
      outputHash.update(line);
      batch.push(line);
      parameterCounts[record.parameterCode] += 1;
      generatedRowCount += 1;
      minimumGeneratedTimestamp ??= record.recordedAt;
      maximumGeneratedTimestamp = record.recordedAt;

      if (batch.length >= config.batchSize) {
        // biome-ignore lint/performance/noAwaitInLoops: Sequential backpressure preserves deterministic row order with bounded memory.
        await outputFile.writeFile(batch.join(""));
        batch.length = 0;
      }
    }
    if (batch.length > 0) {
      await outputFile.writeFile(batch.join(""));
    }
  } finally {
    await outputFile.close();
  }

  if (generatedRowCount !== plan.expectedRowCount) {
    throw new Error(
      `${config.id} wrote ${generatedRowCount} rows; expected ${plan.expectedRowCount}`
    );
  }
  if (
    minimumGeneratedTimestamp === undefined ||
    maximumGeneratedTimestamp === undefined
  ) {
    throw new Error(`${config.id} did not produce any records`);
  }

  const summary: GeneratedSeedSummary = {
    batchSize: config.batchSize,
    configChecksum: plan.configChecksum,
    cyclesPerPond: config.cyclesPerPond,
    datasetId: config.id,
    end: config.end,
    expectedRowCount: plan.expectedRowCount,
    generatedRowCount,
    generationPlanChecksum: plan.generationPlanChecksum,
    generatorVersion: config.generatorVersion,
    intervalSeconds: config.intervalSeconds,
    maximumGeneratedTimestamp,
    minimumGeneratedTimestamp,
    modelConfigChecksum: plan.modelConfigChecksum,
    outputChecksum: `sha256:${outputHash.digest("hex")}`,
    outputFormat: "ndjson",
    outputPath,
    perParameterCounts: parameterCounts,
    pondCount: config.pondCount,
    prngAlgorithm: plan.prngAlgorithm,
    scenarioId: config.scenarioId,
    schemaVersion: 1,
    seed: config.seed,
    sourceType: config.sourceType,
    start: config.start,
  };

  await writeFile(
    partialSummaryPath,
    stablePrettyJson({
      ...summary,
      summaryChecksum: checksumJson(summary),
    }),
    { encoding: "utf8", flag: "wx" }
  );
  await rename(partialOutputPath, outputPath);
  await rename(partialSummaryPath, summaryPath);
  return summary;
};
