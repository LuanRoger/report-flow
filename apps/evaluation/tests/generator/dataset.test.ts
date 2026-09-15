import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateSeedFile } from "../../src/seed/generator/file.ts";
import {
  buildDatasetPlanSummary,
  calculateExpectedSeedRowCount,
  generateSeedRecords,
} from "../../src/seed/generator/generate.ts";
import { checksumMeasurementRecords } from "../../src/seed/generator/scenario.ts";
import {
  loadAllDatasetConfigs,
  loadModelConfig,
  parseDatasetConfig,
} from "../../src/shared/config.ts";
import type { DatasetConfig } from "../../src/shared/types.ts";
import { asRecord } from "../../src/shared/validation.ts";

const CHECKSUM_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const EXPECTED_ROW_COUNT_PATTERN = /expectedRowCount/u;
const OVERWRITE_PATTERN = /Refusing to overwrite/u;

const [model, datasetConfigs] = await Promise.all([
  loadModelConfig(),
  loadAllDatasetConfigs(),
]);

const [baseConfig] = datasetConfigs;
if (baseConfig === undefined) {
  throw new Error("At least one dataset config is required");
}

const smallConfig = (seed = 1234): DatasetConfig => ({
  ...baseConfig,
  batchSize: 3,
  cyclesPerPond: 2,
  end: "2026-04-01T00:00:40.000Z",
  expectedRowCount: 32,
  id: "determinism-test",
  pondCount: 2,
  seed,
  start: "2026-04-01T00:00:00.000Z",
});

describe("dataset planning", () => {
  test("matches every frozen row-count matrix entry", () => {
    const expectedCounts = new Map([
      ["1-pond-7-days", 241_920],
      ["1-pond-30-days", 1_036_800],
      ["10-ponds-7-days", 2_419_200],
      ["10-ponds-30-days", 10_368_000],
      ["50-ponds-7-days", 12_096_000],
      ["50-ponds-30-days", 51_840_000],
    ]);

    expect(datasetConfigs).toHaveLength(expectedCounts.size);
    for (const config of datasetConfigs) {
      const expectedCount = expectedCounts.get(config.id);
      if (expectedCount === undefined) {
        throw new Error(`Unexpected dataset config: ${config.id}`);
      }
      expect(calculateExpectedSeedRowCount(config)).toBe(expectedCount);
      expect(buildDatasetPlanSummary(config, model).expectedRowCount).toBe(
        config.expectedRowCount
      );
    }
  });

  test("creates stable checksums for each generation plan", () => {
    for (const config of datasetConfigs) {
      const first = buildDatasetPlanSummary(config, model);
      const second = buildDatasetPlanSummary(config, model);

      expect(first).toEqual(second);
      expect(first.configChecksum).toMatch(CHECKSUM_PATTERN);
      expect(first.modelConfigChecksum).toMatch(CHECKSUM_PATTERN);
      expect(first.generationPlanChecksum).toMatch(CHECKSUM_PATTERN);
    }
  });

  test("rejects a declared count that disagrees with the formula", () => {
    expect(() =>
      parseDatasetConfig({
        ...smallConfig(),
        expectedRowCount: 31,
      })
    ).toThrow(EXPECTED_ROW_COUNT_PATTERN);
  });
});

describe("seed record generation", () => {
  test("is deterministic for a seed and sensitive to seed changes", () => {
    const first = [...generateSeedRecords(smallConfig(), model)];
    const second = [...generateSeedRecords(smallConfig(), model)];
    const different = [...generateSeedRecords(smallConfig(1235), model)];

    expect(second).toEqual(first);
    expect(checksumMeasurementRecords(second)).toBe(
      checksumMeasurementRecords(first)
    );
    expect(checksumMeasurementRecords(different)).not.toBe(
      checksumMeasurementRecords(first)
    );
  });

  test("preserves timestamp, parameter, unit, value, and ID invariants", () => {
    const config = smallConfig();
    const records = [...generateSeedRecords(config, model)];
    const timestamps = [
      ...new Set(records.map(({ recordedAt }) => recordedAt)),
    ];

    expect(records).toHaveLength(config.expectedRowCount);
    expect(timestamps).toEqual([
      "2026-04-01T00:00:00.000Z",
      "2026-04-01T00:00:10.000Z",
      "2026-04-01T00:00:20.000Z",
      "2026-04-01T00:00:30.000Z",
    ]);

    for (const timestamp of timestamps) {
      const atTimestamp = records.filter(
        ({ recordedAt }) => recordedAt === timestamp
      );
      expect(atTimestamp).toHaveLength(8);
      for (const pondId of [1, 2]) {
        expect(
          atTimestamp
            .filter((record) => record.pondId === pondId)
            .map(({ parameterCode }) => parameterCode)
        ).toEqual(["temperature", "ph", "salinity", "dissolvedOxygen"]);
      }
    }

    for (const record of records) {
      const profile = config.valueProfiles[record.parameterCode];
      expect(record.value).toBeGreaterThanOrEqual(
        profile.center - profile.jitter
      );
      expect(record.value).toBeLessThanOrEqual(profile.center + profile.jitter);
      expect(record.unit).toBe(model.units[record.parameterCode]);
      expect(record.sourceType).toBe("sensor");
    }

    expect([
      ...new Set(
        records
          .filter(({ pondId }) => pondId === 1)
          .map(({ cycleId }) => cycleId)
      ),
    ]).toEqual([1, 2]);
    expect([
      ...new Set(
        records
          .filter(({ pondId }) => pondId === 2)
          .map(({ cycleId }) => cycleId)
      ),
    ]).toEqual([3, 4]);
  });

  test("writes deterministic NDJSON, a checksum summary, and refuses overwrite", async () => {
    const directory = await mkdtemp(join(tmpdir(), "report-flow-evaluation-"));
    const firstPath = join(directory, "first.ndjson");
    const secondPath = join(directory, "second.ndjson");

    try {
      const firstSummary = await generateSeedFile(
        smallConfig(),
        model,
        firstPath
      );
      const secondSummary = await generateSeedFile(
        smallConfig(),
        model,
        secondPath
      );
      const firstBytes = await readFile(firstPath);
      const secondBytes = await readFile(secondPath);
      const persistedSummaryValue: unknown = JSON.parse(
        await readFile(`${firstPath}.summary.json`, "utf8")
      );
      const persistedSummary = asRecord(
        persistedSummaryValue,
        "persistedSummary"
      );
      const byteChecksum = `sha256:${createHash("sha256")
        .update(firstBytes)
        .digest("hex")}`;

      expect(firstBytes.equals(secondBytes)).toBe(true);
      expect(firstSummary.outputChecksum).toBe(byteChecksum);
      expect(secondSummary.outputChecksum).toBe(firstSummary.outputChecksum);
      expect(firstSummary.generatedRowCount).toBe(32);
      expect(firstSummary.perParameterCounts).toEqual({
        dissolvedOxygen: 8,
        ph: 8,
        salinity: 8,
        temperature: 8,
      });
      expect(persistedSummary.outputChecksum).toBe(byteChecksum);
      expect(persistedSummary.summaryChecksum).toMatch(CHECKSUM_PATTERN);
      await expect(
        generateSeedFile(smallConfig(), model, firstPath)
      ).rejects.toThrow(OVERWRITE_PATTERN);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
