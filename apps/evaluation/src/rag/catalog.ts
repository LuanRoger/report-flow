import { readFile } from "node:fs/promises";
import { expectedScenarioRowCount } from "../seed/generator/scenario.ts";
import { parseScoringScenarioConfig } from "../shared/config.ts";
import { checksumJson } from "../shared/json.ts";
import { RAG_CONTEXT_CATALOG_PATH } from "../shared/paths.ts";
import type { ScoringScenarioConfig } from "../shared/types.ts";
import {
  asArray,
  asPositiveInteger,
  asRecord,
  asString,
  assertExactKeys,
} from "../shared/validation.ts";

export const CONTROLLED_CONTEXT_IDS = [
  "ctx:c1:pond-001:7d:p01",
  "ctx:c2:pond-001:7d:p02",
  "ctx:c3-25:pond-001:7d:p03",
  "ctx:c3-50:pond-001:7d:p04",
  "ctx:c4:pond-001:7d:p05",
  "ctx:c5:pond-001:7d:p06",
  "ctx:c6-a:pond-001:100s:p07",
  "ctx:c6-b:pond-001:100s:p08",
  "ctx:c4:pond-001:30d:p09",
] as const;

export type ControlledContextId = (typeof CONTROLLED_CONTEXT_IDS)[number];

const EXPECTED_PERIODS = [
  ["2026-01-01T00:00:00.000Z", "2026-01-08T00:00:00.000Z"],
  ["2026-01-08T00:00:00.000Z", "2026-01-15T00:00:00.000Z"],
  ["2026-01-15T00:00:00.000Z", "2026-01-22T00:00:00.000Z"],
  ["2026-01-22T00:00:00.000Z", "2026-01-29T00:00:00.000Z"],
  ["2026-02-01T00:00:00.000Z", "2026-02-08T00:00:00.000Z"],
  ["2026-02-08T00:00:00.000Z", "2026-02-15T00:00:00.000Z"],
  ["2026-02-15T00:00:00.000Z", "2026-02-15T00:01:40.000Z"],
  ["2026-02-16T00:00:00.000Z", "2026-02-16T00:01:40.000Z"],
  ["2026-03-01T00:00:00.000Z", "2026-03-31T00:00:00.000Z"],
] as const;
const EXPECTED_SCENARIO_IDS = [
  "C1",
  "C2",
  "C3-25",
  "C3-50",
  "C4",
  "C5",
  "C6-A",
  "C6-B",
  "C4",
] as const;

export const CONTROLLED_CONTEXT_COUNT = 9;
export const CONTROLLED_MEASUREMENT_COUNT = 2_488_387;
export const CONTROLLED_POND_ID = 1;
export const CONTROLLED_EMBEDDING_MODEL = "text-embedding-3-small";
export const CONTROLLED_EMBEDDING_DIMENSIONS = 1024;

export interface ControlledContextDefinition {
  contextId: ControlledContextId;
  periodLabel: string;
  scenario: ScoringScenarioConfig;
}

export interface ControlledContextCatalog {
  batchSize: number;
  catalogChecksum: string;
  catalogId: string;
  contexts: readonly ControlledContextDefinition[];
  embedding: {
    dimensions: typeof CONTROLLED_EMBEDDING_DIMENSIONS;
    model: typeof CONTROLLED_EMBEDDING_MODEL;
  };
  expectedContextCount: typeof CONTROLLED_CONTEXT_COUNT;
  expectedMeasurementCount: typeof CONTROLLED_MEASUREMENT_COUNT;
  logicalPondId: typeof CONTROLLED_POND_ID;
  schemaVersion: 1;
}

const parseContextId = (value: unknown, index: number): ControlledContextId => {
  const contextId = asString(value, `catalog.contexts[${index}].contextId`);
  const expected = CONTROLLED_CONTEXT_IDS[index];
  if (contextId !== expected) {
    throw new Error(
      `catalog.contexts[${index}].contextId must equal ${expected ?? "a defined context ID"}`
    );
  }
  return expected;
};

const parseContext = (
  value: unknown,
  index: number
): ControlledContextDefinition => {
  const path = `catalog.contexts[${index}]`;
  const record = asRecord(value, path);
  assertExactKeys(record, ["contextId", "periodLabel", "scenario"], path);
  const scenario = parseScoringScenarioConfig(record.scenario);
  const expectedPeriod = EXPECTED_PERIODS[index];
  const expectedScenarioId = EXPECTED_SCENARIO_IDS[index];
  if (!(expectedPeriod && expectedScenarioId)) {
    throw new Error(`${path} is outside the frozen nine-context catalog`);
  }
  if (
    scenario.id !== expectedScenarioId ||
    scenario.pondId !== CONTROLLED_POND_ID ||
    scenario.cycleId !== index + 1 ||
    scenario.start !== expectedPeriod[0] ||
    scenario.end !== expectedPeriod[1]
  ) {
    throw new Error(
      `${path} does not match the frozen scenario, pond, cycle, or period`
    );
  }

  const periodLabel = asString(record.periodLabel, `${path}.periodLabel`);
  const expectedPeriodLabel = `p${String(index + 1).padStart(2, "0")}`;
  if (periodLabel !== expectedPeriodLabel) {
    throw new Error(`${path}.periodLabel must equal ${expectedPeriodLabel}`);
  }

  return {
    contextId: parseContextId(record.contextId, index),
    periodLabel,
    scenario,
  };
};

export const parseControlledContextCatalog = (
  value: unknown
): ControlledContextCatalog => {
  const record = asRecord(value, "catalog");
  assertExactKeys(
    record,
    [
      "batchSize",
      "catalogId",
      "contexts",
      "embedding",
      "expectedContextCount",
      "expectedMeasurementCount",
      "logicalPondId",
      "schemaVersion",
    ],
    "catalog"
  );
  if (record.schemaVersion !== 1) {
    throw new Error("catalog.schemaVersion must equal 1");
  }
  if (record.catalogId !== "controlled-rag-kb-v1") {
    throw new Error("catalog.catalogId must equal controlled-rag-kb-v1");
  }
  if (record.logicalPondId !== CONTROLLED_POND_ID) {
    throw new Error(`catalog.logicalPondId must equal ${CONTROLLED_POND_ID}`);
  }
  if (record.expectedContextCount !== CONTROLLED_CONTEXT_COUNT) {
    throw new Error(
      `catalog.expectedContextCount must equal ${CONTROLLED_CONTEXT_COUNT}`
    );
  }
  if (record.expectedMeasurementCount !== CONTROLLED_MEASUREMENT_COUNT) {
    throw new Error(
      `catalog.expectedMeasurementCount must equal ${CONTROLLED_MEASUREMENT_COUNT}`
    );
  }

  const embedding = asRecord(record.embedding, "catalog.embedding");
  assertExactKeys(embedding, ["dimensions", "model"], "catalog.embedding");
  if (
    embedding.model !== CONTROLLED_EMBEDDING_MODEL ||
    embedding.dimensions !== CONTROLLED_EMBEDDING_DIMENSIONS
  ) {
    throw new Error(
      `catalog.embedding must use ${CONTROLLED_EMBEDDING_MODEL} with ${CONTROLLED_EMBEDDING_DIMENSIONS} dimensions`
    );
  }

  const contexts = asArray(record.contexts, "catalog.contexts").map(
    parseContext
  );
  if (contexts.length !== CONTROLLED_CONTEXT_COUNT) {
    throw new Error(
      `catalog.contexts must contain exactly ${CONTROLLED_CONTEXT_COUNT} entries`
    );
  }
  const computedMeasurementCount = contexts.reduce(
    (total, { scenario }) => total + expectedScenarioRowCount(scenario),
    0
  );
  if (computedMeasurementCount !== CONTROLLED_MEASUREMENT_COUNT) {
    throw new Error(
      `Frozen catalog calculates ${computedMeasurementCount} measurements; expected ${CONTROLLED_MEASUREMENT_COUNT}`
    );
  }

  const catalogValue: Omit<ControlledContextCatalog, "catalogChecksum"> = {
    batchSize: asPositiveInteger(record.batchSize, "catalog.batchSize"),
    catalogId: "controlled-rag-kb-v1",
    contexts,
    embedding: {
      dimensions: CONTROLLED_EMBEDDING_DIMENSIONS,
      model: CONTROLLED_EMBEDDING_MODEL,
    },
    expectedContextCount: CONTROLLED_CONTEXT_COUNT,
    expectedMeasurementCount: CONTROLLED_MEASUREMENT_COUNT,
    logicalPondId: CONTROLLED_POND_ID,
    schemaVersion: 1 as const,
  };

  return {
    ...catalogValue,
    catalogChecksum: checksumJson(catalogValue),
  };
};

export const loadControlledContextCatalog = async (
  path = RAG_CONTEXT_CATALOG_PATH
): Promise<ControlledContextCatalog> => {
  const serialized = await readFile(path, "utf8");
  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch (error) {
    throw new Error(`Invalid controlled RAG catalog JSON: ${path}`, {
      cause: error,
    });
  }
  return parseControlledContextCatalog(value);
};
