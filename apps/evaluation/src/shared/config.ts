import { readFile } from "node:fs/promises";
import {
  DATASET_CONFIG_PATHS,
  INVALID_PAYLOAD_CONFIG_PATH,
  MODEL_CONFIG_PATH,
  SCORING_SCENARIO_PATHS,
} from "./paths.ts";
import { collectionInstantCount, validateWindow } from "./time.ts";
import {
  type AcceptedPayloadControl,
  type DatasetConfig,
  type InvalidFixtureCategory,
  type InvalidPayloadConfig,
  type InvalidPayloadFixture,
  type ModelConfig,
  type NormalizationConfig,
  PARAMETER_CODES,
  type ParameterCode,
  type ParameterRecord,
  SCORING_SCENARIO_IDS,
  type ScenarioSegment,
  type ScenarioSeries,
  type ScoringScenarioConfig,
  type ScoringScenarioId,
  type SourceType,
  type ValueProfile,
} from "./types.ts";
import {
  asArray,
  asFiniteNumber,
  asNonnegativeInteger,
  asOptionalString,
  asPositiveInteger,
  asRecord,
  asString,
  asStringArray,
  assertExactKeys,
  hasOwn,
} from "./validation.ts";

const MAXIMUM_SEED = 4_294_967_295;

const expectLiteral = <Value extends string | number>(
  value: unknown,
  expected: Value,
  path: string
): Value => {
  if (value !== expected) {
    throw new Error(`${path} must equal ${JSON.stringify(expected)}`);
  }
  return expected;
};

const parseParameterRecord = <Value>(
  value: unknown,
  path: string,
  parseValue: (
    entry: unknown,
    entryPath: string,
    parameterCode: ParameterCode
  ) => Value
): ParameterRecord<Value> => {
  const record = asRecord(value, path);
  assertExactKeys(record, PARAMETER_CODES, path);

  return {
    dissolvedOxygen: parseValue(
      record.dissolvedOxygen,
      `${path}.dissolvedOxygen`,
      "dissolvedOxygen"
    ),
    ph: parseValue(record.ph, `${path}.ph`, "ph"),
    salinity: parseValue(record.salinity, `${path}.salinity`, "salinity"),
    temperature: parseValue(
      record.temperature,
      `${path}.temperature`,
      "temperature"
    ),
  };
};

const parseSourceType = (value: unknown, path: string): SourceType => {
  if (value === "manual" || value === "sensor") {
    return value;
  }
  throw new Error(`${path} must be manual or sensor`);
};

const parseScoringScenarioId = (
  value: unknown,
  path: string
): ScoringScenarioId => {
  const id = asString(value, path);
  const matchedId = SCORING_SCENARIO_IDS.find((candidate) => candidate === id);
  if (matchedId === undefined) {
    throw new Error(`${path} is not a supported scoring scenario ID`);
  }
  return matchedId;
};

const parseNormalization = (
  value: unknown,
  path: string,
  parameterCode: ParameterCode
): NormalizationConfig => {
  const record = asRecord(value, path);

  if (parameterCode === "dissolvedOxygen") {
    expectLiteral(record.kind, "symmetricTriangle", `${path}.kind`);
    const halfWidth = asFiniteNumber(record.halfWidth, `${path}.halfWidth`);
    if (halfWidth <= 0) {
      throw new Error(`${path}.halfWidth must be positive`);
    }
    return {
      halfWidth,
      kind: "symmetricTriangle",
      reference: asFiniteNumber(record.reference, `${path}.reference`),
    };
  }

  expectLiteral(record.kind, "gaussian", `${path}.kind`);
  const sigma = asFiniteNumber(record.sigma, `${path}.sigma`);
  if (sigma <= 0) {
    throw new Error(`${path}.sigma must be positive`);
  }
  return {
    kind: "gaussian",
    mu: asFiniteNumber(record.mu, `${path}.mu`),
    sigma,
  };
};

const validateModelWeights = (config: ModelConfig): void => {
  let sum = 0;
  for (const parameterCode of PARAMETER_CODES) {
    const weight = config.weights[parameterCode];
    if (weight < 0) {
      throw new Error(`weights.${parameterCode} must be nonnegative`);
    }
    sum += weight;
  }

  if (Math.abs(sum - 1) > config.weightSumTolerance) {
    throw new Error(
      `Model weights must sum to 1 within ${config.weightSumTolerance}; received ${sum}`
    );
  }
};

export const parseModelConfig = (value: unknown): ModelConfig => {
  const record = asRecord(value, "model");
  expectLiteral(record.schemaVersion, 1, "model.schemaVersion");

  const runtimeParameterCodes = asArray(
    record.runtimeParameterCodes,
    "model.runtimeParameterCodes"
  ).map((entry, index) =>
    asString(entry, `model.runtimeParameterCodes[${index}]`)
  );
  if (
    runtimeParameterCodes.length !== PARAMETER_CODES.length ||
    runtimeParameterCodes.some(
      (parameterCode, index) => parameterCode !== PARAMETER_CODES[index]
    )
  ) {
    throw new Error(
      `model.runtimeParameterCodes must be exactly ${PARAMETER_CODES.join(", ")}`
    );
  }

  const scoreRangeRecord = asRecord(record.scoreRange, "model.scoreRange");
  const minimumScore = asFiniteNumber(
    scoreRangeRecord.minimum,
    "model.scoreRange.minimum"
  );
  const maximumScore = asFiniteNumber(
    scoreRangeRecord.maximum,
    "model.scoreRange.maximum"
  );
  if (maximumScore <= minimumScore) {
    throw new Error("model.scoreRange.maximum must exceed its minimum");
  }

  const temporalRecord = asRecord(record.temporal, "model.temporal");
  const defaultMaximumContinuityGapSeconds = asFiniteNumber(
    temporalRecord.defaultMaximumContinuityGapSeconds,
    "model.temporal.defaultMaximumContinuityGapSeconds"
  );
  if (defaultMaximumContinuityGapSeconds <= 0) {
    throw new Error(
      "model.temporal.defaultMaximumContinuityGapSeconds must be positive"
    );
  }
  const minimumCoveragePerParameter = asFiniteNumber(
    temporalRecord.minimumCoveragePerParameter,
    "model.temporal.minimumCoveragePerParameter"
  );
  if (minimumCoveragePerParameter < 0 || minimumCoveragePerParameter > 1) {
    throw new Error(
      "model.temporal.minimumCoveragePerParameter must be within [0,1]"
    );
  }

  const collectionRecord = asRecord(record.collection, "model.collection");
  const weightSumTolerance = asFiniteNumber(
    record.weightSumTolerance,
    "model.weightSumTolerance"
  );
  if (weightSumTolerance <= 0) {
    throw new Error("model.weightSumTolerance must be positive");
  }

  const formulasRecord = asRecord(record.formulas, "model.formulas");
  const config: ModelConfig = {
    collection: {
      intervalSeconds: asPositiveInteger(
        collectionRecord.intervalSeconds,
        "model.collection.intervalSeconds"
      ),
      timezone: expectLiteral(
        collectionRecord.timezone,
        "UTC",
        "model.collection.timezone"
      ),
      windowConvention: expectLiteral(
        collectionRecord.windowConvention,
        "[start,end)",
        "model.collection.windowConvention"
      ),
    },
    formulas: {
      dissolvedOxygen: asString(
        formulasRecord.dissolvedOxygen,
        "model.formulas.dissolvedOxygen"
      ),
      gaussian: asString(formulasRecord.gaussian, "model.formulas.gaussian"),
      pLow: asString(formulasRecord.pLow, "model.formulas.pLow"),
      pondScore: asString(formulasRecord.pondScore, "model.formulas.pondScore"),
    },
    limitations: asStringArray(record.limitations, "model.limitations"),
    modelVersion: asString(record.modelVersion, "model.modelVersion"),
    normalization: parseParameterRecord(
      record.normalization,
      "model.normalization",
      parseNormalization
    ),
    runtimeParameterCodes: [...PARAMETER_CODES],
    schemaVersion: 1,
    scoreRange: {
      maximum: maximumScore,
      minimum: minimumScore,
    },
    temporal: {
      defaultMaximumContinuityGapSeconds,
      finalScoreAvailabilityRule: expectLiteral(
        temporalRecord.finalScoreAvailabilityRule,
        "allParametersHaveTemporalScores",
        "model.temporal.finalScoreAvailabilityRule"
      ),
      formula: asString(temporalRecord.formula, "model.temporal.formula"),
      minimumCoveragePerParameter,
      missingDataTreatment: expectLiteral(
        temporalRecord.missingDataTreatment,
        "excludeFromScoreDenominators",
        "model.temporal.missingDataTreatment"
      ),
      sufficiencyRule: expectLiteral(
        temporalRecord.sufficiencyRule,
        "allParameters",
        "model.temporal.sufficiencyRule"
      ),
      thresholdComparison: expectLiteral(
        temporalRecord.thresholdComparison,
        "score < unfavorableThreshold",
        "model.temporal.thresholdComparison"
      ),
    },
    unfavorableThreshold: asFiniteNumber(
      record.unfavorableThreshold,
      "model.unfavorableThreshold"
    ),
    units: parseParameterRecord(record.units, "model.units", (entry, path) =>
      asString(entry, path)
    ),
    weightSumTolerance,
    weights: parseParameterRecord(
      record.weights,
      "model.weights",
      (entry, path) => asFiniteNumber(entry, path)
    ),
  };

  if (
    config.unfavorableThreshold < minimumScore ||
    config.unfavorableThreshold > maximumScore
  ) {
    throw new Error(
      "model.unfavorableThreshold must be within the score range"
    );
  }
  validateModelWeights(config);
  return config;
};

const parseSegments = (
  value: unknown,
  path: string,
  durationSeconds: number,
  intervalSeconds: number
): ScenarioSegment[] => {
  const segments = asArray(value, path).map((entry, index) => {
    const segmentPath = `${path}[${index}]`;
    const segment = asRecord(entry, segmentPath);
    return {
      startOffsetSeconds: asNonnegativeInteger(
        segment.startOffsetSeconds,
        `${segmentPath}.startOffsetSeconds`
      ),
      value: asFiniteNumber(segment.value, `${segmentPath}.value`),
    };
  });

  if (segments.length === 0 || segments[0]?.startOffsetSeconds !== 0) {
    throw new Error(`${path} must start with an offset of 0 seconds`);
  }

  let previousOffset = -1;
  for (const segment of segments) {
    if (
      segment.startOffsetSeconds <= previousOffset ||
      segment.startOffsetSeconds >= durationSeconds
    ) {
      throw new Error(
        `${path} offsets must be strictly increasing within the window`
      );
    }
    if (segment.startOffsetSeconds % intervalSeconds !== 0) {
      throw new Error(`${path} offsets must align to the collection interval`);
    }
    previousOffset = segment.startOffsetSeconds;
  }

  return segments;
};

const parseScenarioSeries = (
  value: unknown,
  path: string,
  durationSeconds: number,
  intervalSeconds: number
): ScenarioSeries => {
  const record = asRecord(value, path);
  if (record.mode === "cadence") {
    return {
      mode: "cadence",
      segments: parseSegments(
        record.segments,
        `${path}.segments`,
        durationSeconds,
        intervalSeconds
      ),
    };
  }

  if (record.mode !== "explicit") {
    throw new Error(`${path}.mode must be cadence or explicit`);
  }

  const readings = asArray(record.readings, `${path}.readings`).map(
    (entry, index) => {
      const readingPath = `${path}.readings[${index}]`;
      const reading = asRecord(entry, readingPath);
      return {
        offsetSeconds: asNonnegativeInteger(
          reading.offsetSeconds,
          `${readingPath}.offsetSeconds`
        ),
        value: asFiniteNumber(reading.value, `${readingPath}.value`),
      };
    }
  );
  if (readings.length === 0) {
    throw new Error(`${path}.readings must not be empty`);
  }

  let previousOffset = -1;
  for (const reading of readings) {
    if (
      reading.offsetSeconds <= previousOffset ||
      reading.offsetSeconds >= durationSeconds
    ) {
      throw new Error(
        `${path}.readings offsets must be unique, increasing, and within the window`
      );
    }
    previousOffset = reading.offsetSeconds;
  }

  return { mode: "explicit", readings };
};

export const parseScoringScenarioConfig = (
  value: unknown
): ScoringScenarioConfig => {
  const record = asRecord(value, "scenario");
  expectLiteral(record.schemaVersion, 1, "scenario.schemaVersion");
  expectLiteral(record.kind, "scoring", "scenario.kind");

  const start = asString(record.start, "scenario.start");
  const end = asString(record.end, "scenario.end");
  const durationMilliseconds = validateWindow(start, end);
  const durationSeconds = durationMilliseconds / 1000;
  if (!Number.isSafeInteger(durationSeconds)) {
    throw new Error("scenario window must contain a whole number of seconds");
  }

  const intervalSeconds = asPositiveInteger(
    record.intervalSeconds,
    "scenario.intervalSeconds"
  );
  collectionInstantCount(start, end, intervalSeconds);

  const documentedCadenceException = asOptionalString(
    record.documentedCadenceException,
    "scenario.documentedCadenceException"
  );
  const series = parseParameterRecord(
    record.series,
    "scenario.series",
    (entry, path) =>
      parseScenarioSeries(entry, path, durationSeconds, intervalSeconds)
  );
  const hasExplicitSeries = PARAMETER_CODES.some(
    (parameterCode) => series[parameterCode].mode === "explicit"
  );
  if (hasExplicitSeries && documentedCadenceException === undefined) {
    throw new Error(
      "Scenarios with explicit readings must document their cadence exception"
    );
  }

  const maximumContinuityGapSecondsValue = record.maximumContinuityGapSeconds;
  let maximumContinuityGapSeconds: number | undefined;
  if (maximumContinuityGapSecondsValue !== undefined) {
    maximumContinuityGapSeconds = asFiniteNumber(
      maximumContinuityGapSecondsValue,
      "scenario.maximumContinuityGapSeconds"
    );
    if (maximumContinuityGapSeconds <= 0) {
      throw new Error("scenario.maximumContinuityGapSeconds must be positive");
    }
  }

  return {
    cycleId: asPositiveInteger(record.cycleId, "scenario.cycleId"),
    description: asString(record.description, "scenario.description"),
    documentedCadenceException,
    end,
    id: parseScoringScenarioId(record.id, "scenario.id"),
    intervalSeconds,
    kind: "scoring",
    maximumContinuityGapSeconds,
    pondId: asPositiveInteger(record.pondId, "scenario.pondId"),
    schemaVersion: 1,
    seed: asNonnegativeInteger(record.seed, "scenario.seed"),
    series,
    sourceType: parseSourceType(record.sourceType, "scenario.sourceType"),
    start,
  };
};

const parseInvalidFixtureCategory = (
  value: unknown,
  path: string
): InvalidFixtureCategory => {
  if (
    value === "schema" ||
    value === "transport" ||
    value === "relationship" ||
    value === "identity"
  ) {
    return value;
  }
  throw new Error(`${path} has an unsupported fixture category`);
};

const parseInvalidPayloadFixture = (
  value: unknown,
  path: string
): InvalidPayloadFixture => {
  const record = asRecord(value, path);
  const hasBody = hasOwn(record, "body");
  const hasRawBody = hasOwn(record, "rawBody");
  const hasRequests = hasOwn(record, "requests");
  const representationCount =
    Number(hasBody) + Number(hasRawBody) + Number(hasRequests);
  if (representationCount !== 1) {
    throw new Error(
      `${path} must define exactly one of body, rawBody, or requests`
    );
  }

  const fixture: InvalidPayloadFixture = {
    category: parseInvalidFixtureCategory(record.category, `${path}.category`),
    expectedPersistenceDelta: asNonnegativeInteger(
      record.expectedPersistenceDelta,
      `${path}.expectedPersistenceDelta`
    ),
    id: asString(record.id, `${path}.id`),
  };

  if (hasBody) {
    fixture.body = asRecord(record.body, `${path}.body`);
  }
  if (hasRawBody) {
    fixture.rawBody = asString(record.rawBody, `${path}.rawBody`);
  }
  if (hasRequests) {
    fixture.requests = asArray(record.requests, `${path}.requests`).map(
      (request, index) => asRecord(request, `${path}.requests[${index}]`)
    );
    if (fixture.requests.length < 2) {
      throw new Error(`${path}.requests must contain at least two requests`);
    }
  }
  if (record.setup !== undefined) {
    fixture.setup = asRecord(record.setup, `${path}.setup`);
  }
  const expectedSecondRequest = asOptionalString(
    record.expectedSecondRequest,
    `${path}.expectedSecondRequest`
  );
  if (expectedSecondRequest !== undefined) {
    fixture.expectedSecondRequest = expectedSecondRequest;
  }
  return fixture;
};

const parseAcceptedPayloadControl = (
  value: unknown,
  path: string
): AcceptedPayloadControl => {
  const record = asRecord(value, path);
  return {
    body: asRecord(record.body, `${path}.body`),
    expectedPersistenceDelta: asNonnegativeInteger(
      record.expectedPersistenceDelta,
      `${path}.expectedPersistenceDelta`
    ),
    id: asString(record.id, `${path}.id`),
  };
};

export const parseInvalidPayloadConfig = (
  value: unknown
): InvalidPayloadConfig => {
  const record = asRecord(value, "invalidPayloadConfig");
  expectLiteral(record.schemaVersion, 1, "invalidPayloadConfig.schemaVersion");
  expectLiteral(record.kind, "invalidPayloads", "invalidPayloadConfig.kind");
  expectLiteral(record.id, "C7", "invalidPayloadConfig.id");

  const cases = asArray(record.cases, "invalidPayloadConfig.cases").map(
    (entry, index) =>
      parseInvalidPayloadFixture(entry, `invalidPayloadConfig.cases[${index}]`)
  );
  const acceptedControls = asArray(
    record.acceptedControls,
    "invalidPayloadConfig.acceptedControls"
  ).map((entry, index) =>
    parseAcceptedPayloadControl(
      entry,
      `invalidPayloadConfig.acceptedControls[${index}]`
    )
  );
  const ids = [...cases, ...acceptedControls].map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("C7 fixture IDs must be unique");
  }

  return {
    acceptedControls,
    cases,
    description: asString(
      record.description,
      "invalidPayloadConfig.description"
    ),
    endpoint: asString(record.endpoint, "invalidPayloadConfig.endpoint"),
    id: "C7",
    kind: "invalidPayloads",
    schemaVersion: 1,
    transportNotes: asStringArray(
      record.transportNotes,
      "invalidPayloadConfig.transportNotes"
    ),
    validControl: asRecord(
      record.validControl,
      "invalidPayloadConfig.validControl"
    ),
  };
};

const parseValueProfile = (value: unknown, path: string): ValueProfile => {
  const record = asRecord(value, path);
  const jitter = asFiniteNumber(record.jitter, `${path}.jitter`);
  if (jitter < 0) {
    throw new Error(`${path}.jitter must be nonnegative`);
  }
  return {
    center: asFiniteNumber(record.center, `${path}.center`),
    jitter,
  };
};

export const parseDatasetConfig = (value: unknown): DatasetConfig => {
  const record = asRecord(value, "dataset");
  expectLiteral(record.schemaVersion, 1, "dataset.schemaVersion");
  expectLiteral(
    record.generatorVersion,
    "evaluation-seed-v1",
    "dataset.generatorVersion"
  );

  const seed = asNonnegativeInteger(record.seed, "dataset.seed");
  if (seed > MAXIMUM_SEED) {
    throw new Error(`dataset.seed must not exceed ${MAXIMUM_SEED}`);
  }

  const start = asString(record.start, "dataset.start");
  const end = asString(record.end, "dataset.end");
  const intervalSeconds = asPositiveInteger(
    record.intervalSeconds,
    "dataset.intervalSeconds"
  );
  const pondCount = asPositiveInteger(record.pondCount, "dataset.pondCount");
  const cyclesPerPond = asPositiveInteger(
    record.cyclesPerPond,
    "dataset.cyclesPerPond"
  );
  const expectedRowCount = asPositiveInteger(
    record.expectedRowCount,
    "dataset.expectedRowCount"
  );
  const instantCount = collectionInstantCount(start, end, intervalSeconds);
  const calculatedRowCount = instantCount * PARAMETER_CODES.length * pondCount;
  if (!Number.isSafeInteger(calculatedRowCount)) {
    throw new Error(
      "dataset calculated row count exceeds safe integer precision"
    );
  }
  if (expectedRowCount !== calculatedRowCount) {
    throw new Error(
      `dataset.expectedRowCount is ${expectedRowCount}, but the frozen formula produces ${calculatedRowCount}`
    );
  }

  return {
    batchSize: asPositiveInteger(record.batchSize, "dataset.batchSize"),
    cyclesPerPond,
    end,
    expectedRowCount,
    generatorVersion: "evaluation-seed-v1",
    id: asString(record.id, "dataset.id"),
    intervalSeconds,
    pondCount,
    scenarioId: parseScoringScenarioId(record.scenarioId, "dataset.scenarioId"),
    schemaVersion: 1,
    seed,
    sourceType: parseSourceType(record.sourceType, "dataset.sourceType"),
    start,
    valueProfiles: parseParameterRecord(
      record.valueProfiles,
      "dataset.valueProfiles",
      (entry, path) => parseValueProfile(entry, path)
    ),
  };
};

const readJsonFile = async (path: string): Promise<unknown> => {
  const serialized = await readFile(path, "utf8");
  try {
    const value: unknown = JSON.parse(serialized);
    return value;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON configuration ${path}: ${message}`, {
      cause: error,
    });
  }
};

export const loadModelConfig = async (
  path = MODEL_CONFIG_PATH
): Promise<ModelConfig> => parseModelConfig(await readJsonFile(path));

export const loadScoringScenarioConfig = async (
  path: string
): Promise<ScoringScenarioConfig> =>
  parseScoringScenarioConfig(await readJsonFile(path));

export const loadAllScoringScenarioConfigs = async (): Promise<
  ScoringScenarioConfig[]
> => await Promise.all(SCORING_SCENARIO_PATHS.map(loadScoringScenarioConfig));

export const loadInvalidPayloadConfig = async (
  path = INVALID_PAYLOAD_CONFIG_PATH
): Promise<InvalidPayloadConfig> =>
  parseInvalidPayloadConfig(await readJsonFile(path));

export const loadDatasetConfig = async (path: string): Promise<DatasetConfig> =>
  parseDatasetConfig(await readJsonFile(path));

export const loadAllDatasetConfigs = async (): Promise<DatasetConfig[]> =>
  await Promise.all(DATASET_CONFIG_PATHS.map(loadDatasetConfig));
