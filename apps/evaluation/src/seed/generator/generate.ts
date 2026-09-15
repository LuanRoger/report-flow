import { checksumJson } from "../../shared/json.ts";
import {
  collectionInstantCount,
  parseUtcTimestamp,
  timestampByIndex,
  toUtcIsoString,
} from "../../shared/time.ts";
import {
  type DatasetConfig,
  type MeasurementRecord,
  type ModelConfig,
  PARAMETER_CODES,
  type ParameterCode,
  type ParameterRecord,
} from "../../shared/types.ts";
import { ParkMillerPrng, PRNG_ALGORITHM } from "./prng.ts";

const MILLISECONDS_PER_SECOND = 1000;

export interface DatasetPlanSummary {
  collectionInstantCount: number;
  configChecksum: string;
  cyclesPerPond: number;
  datasetId: string;
  end: string;
  expectedRowCount: number;
  generationPlanChecksum: string;
  generatorVersion: DatasetConfig["generatorVersion"];
  intervalSeconds: number;
  modelConfigChecksum: string;
  parameterCount: number;
  perParameterRowCount: number;
  pondCount: number;
  prngAlgorithm: typeof PRNG_ALGORITHM;
  scenarioId: string;
  seed: number;
  start: string;
  windowConvention: "[start,end)";
}

export const calculateExpectedSeedRowCount = (
  config: DatasetConfig
): number => {
  const instantCount = collectionInstantCount(
    config.start,
    config.end,
    config.intervalSeconds
  );
  const rowCount = instantCount * PARAMETER_CODES.length * config.pondCount;
  if (!Number.isSafeInteger(rowCount)) {
    throw new Error("Expected seed row count exceeds safe integer precision");
  }
  return rowCount;
};

export const buildDatasetPlanSummary = (
  config: DatasetConfig,
  model: ModelConfig
): DatasetPlanSummary => {
  if (config.intervalSeconds !== model.collection.intervalSeconds) {
    throw new Error(
      `${config.id} interval does not match the tracked model collection interval`
    );
  }
  const instantCount = collectionInstantCount(
    config.start,
    config.end,
    config.intervalSeconds
  );
  const expectedRowCount = calculateExpectedSeedRowCount(config);
  if (expectedRowCount !== config.expectedRowCount) {
    throw new Error(
      `${config.id} declares ${config.expectedRowCount} rows but calculates ${expectedRowCount}`
    );
  }

  const configChecksum = checksumJson(config);
  const modelConfigChecksum = checksumJson(model);
  const generationPlanChecksum = checksumJson({
    configChecksum,
    generatorVersion: config.generatorVersion,
    modelConfigChecksum,
    parameterOrder: PARAMETER_CODES,
    prngAlgorithm: PRNG_ALGORITHM,
    timestampFormula: "startEpochMs + index * intervalMs",
  });

  return {
    collectionInstantCount: instantCount,
    configChecksum,
    cyclesPerPond: config.cyclesPerPond,
    datasetId: config.id,
    end: config.end,
    expectedRowCount,
    generationPlanChecksum,
    generatorVersion: config.generatorVersion,
    intervalSeconds: config.intervalSeconds,
    modelConfigChecksum,
    parameterCount: PARAMETER_CODES.length,
    perParameterRowCount: instantCount * config.pondCount,
    pondCount: config.pondCount,
    prngAlgorithm: PRNG_ALGORITHM,
    scenarioId: config.scenarioId,
    seed: config.seed,
    start: config.start,
    windowConvention: "[start,end)",
  };
};

const cycleIdFor = (
  pondIndex: number,
  instantIndex: number,
  instantCount: number,
  cyclesPerPond: number
): number => {
  const cycleOffset = Math.min(
    cyclesPerPond - 1,
    Math.floor((instantIndex * cyclesPerPond) / instantCount)
  );
  const cycleId = pondIndex * cyclesPerPond + cycleOffset + 1;
  if (!Number.isSafeInteger(cycleId)) {
    throw new Error("Generated cycle ID exceeds safe integer precision");
  }
  return cycleId;
};

const generateValue = (
  parameterCode: ParameterCode,
  config: DatasetConfig,
  prng: ParkMillerPrng
): number => {
  const profile = config.valueProfiles[parameterCode];
  return prng.nextBetween(
    profile.center - profile.jitter,
    profile.center + profile.jitter
  );
};

export function* generateSeedRecords(
  config: DatasetConfig,
  model: ModelConfig
): Generator<MeasurementRecord, void, undefined> {
  const plan = buildDatasetPlanSummary(config, model);
  const prng = new ParkMillerPrng(config.seed);
  const startEpochMilliseconds = parseUtcTimestamp(
    config.start,
    `${config.id}.start`
  );
  const intervalMilliseconds = config.intervalSeconds * MILLISECONDS_PER_SECOND;
  let generatedRowCount = 0;
  let instantIndex = 0;

  while (instantIndex < plan.collectionInstantCount) {
    const recordedAt = toUtcIsoString(
      timestampByIndex(
        startEpochMilliseconds,
        instantIndex,
        intervalMilliseconds
      )
    );
    let pondIndex = 0;
    while (pondIndex < config.pondCount) {
      const pondId = pondIndex + 1;
      const cycleId = cycleIdFor(
        pondIndex,
        instantIndex,
        plan.collectionInstantCount,
        config.cyclesPerPond
      );
      for (const parameterCode of PARAMETER_CODES) {
        yield {
          cycleId,
          parameterCode,
          pondId,
          recordedAt,
          sourceType: config.sourceType,
          unit: model.units[parameterCode],
          value: generateValue(parameterCode, config, prng),
        };
        generatedRowCount += 1;
      }
      pondIndex += 1;
    }
    instantIndex += 1;
  }

  if (generatedRowCount !== plan.expectedRowCount) {
    throw new Error(
      `${config.id} generated ${generatedRowCount} rows; expected ${plan.expectedRowCount}`
    );
  }
}

export const emptyParameterCounts = (): ParameterRecord<number> => ({
  dissolvedOxygen: 0,
  ph: 0,
  salinity: 0,
  temperature: 0,
});
