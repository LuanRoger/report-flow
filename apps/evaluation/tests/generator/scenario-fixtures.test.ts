import { describe, expect, test } from "bun:test";
import {
  checksumMeasurementRecords,
  expectedScenarioRowCount,
  generateScenarioMeasurements,
  scenarioTransitionTimestamps,
} from "../../src/seed/generator/scenario.ts";
import {
  loadAllScoringScenarioConfigs,
  loadInvalidPayloadConfig,
  loadModelConfig,
} from "../../src/shared/config.ts";
import { PARAMETER_CODES } from "../../src/shared/types.ts";

const [model, scenarios, invalidPayloads] = await Promise.all([
  loadModelConfig(),
  loadAllScoringScenarioConfigs(),
  loadInvalidPayloadConfig(),
]);

const scenarioById = (id: string) => {
  const scenario = scenarios.find((candidate) => candidate.id === id);
  if (scenario === undefined) {
    throw new Error(`Missing scenario: ${id}`);
  }
  return scenario;
};

describe("tracked scoring fixtures", () => {
  test("loads every required scoring scenario in stable order", () => {
    expect(scenarios.map(({ id }) => id)).toEqual([
      "C1",
      "C2",
      "C3-25",
      "C3-50",
      "C4",
      "C5",
      "C6-A",
      "C6-B",
    ]);
  });

  test("normal fixtures have four ordered parameter rows per instant", () => {
    for (const scenarioId of ["C1", "C2", "C3-25", "C3-50", "C5"] as const) {
      const scenario = scenarioById(scenarioId);
      const records = generateScenarioMeasurements(scenario, model);
      const recordsByTimestamp = new Map<string, string[]>();

      for (const record of records) {
        const parameterCodes = recordsByTimestamp.get(record.recordedAt) ?? [];
        parameterCodes.push(record.parameterCode);
        recordsByTimestamp.set(record.recordedAt, parameterCodes);
        expect(record.unit).toBe(model.units[record.parameterCode]);
        expect(record.sourceType).toBe("manual");
      }

      for (const parameterCodes of recordsByTimestamp.values()) {
        expect(parameterCodes).toEqual([...PARAMETER_CODES]);
      }
      expect(records.length).toBe(expectedScenarioRowCount(scenario));
      expect(records[0]?.recordedAt).toBe(scenario.start);
      const finalTimestamp = records.at(-1)?.recordedAt;
      if (finalTimestamp === undefined) {
        throw new Error(`${scenario.id} did not generate records`);
      }
      expect(finalTimestamp.localeCompare(scenario.end)).toBeLessThan(0);
    }
  });

  test("C4 has one day of rows and exact transition timestamps", () => {
    const c4 = scenarioById("C4");

    expect(expectedScenarioRowCount(c4)).toBe(34_560);
    expect(scenarioTransitionTimestamps(c4)).toEqual({
      dissolvedOxygen: ["2026-01-05T09:00:00.000Z", "2026-01-05T15:00:00.000Z"],
    });
  });

  test("C3 transition timestamps preserve exact proportions", () => {
    expect(scenarioTransitionTimestamps(scenarioById("C3-25"))).toEqual({
      temperature: ["2026-01-03T00:01:40.000Z"],
    });
    expect(scenarioTransitionTimestamps(scenarioById("C3-50"))).toEqual({
      temperature: ["2026-01-04T00:03:20.000Z"],
    });
  });

  test("documents and counts irregular fixtures explicitly", () => {
    const c6a = scenarioById("C6-A");
    const c6b = scenarioById("C6-B");

    expect(c6a.documentedCadenceException).toBeString();
    expect(c6a.maximumContinuityGapSeconds).toBe(90);
    expect(expectedScenarioRowCount(c6a)).toBe(32);
    expect(c6b.documentedCadenceException).toBeString();
    expect(c6b.maximumContinuityGapSeconds).toBeUndefined();
    expect(expectedScenarioRowCount(c6b)).toBe(35);
  });

  test("produces deterministic row ordering and checksums", () => {
    const scenario = scenarioById("C1");
    const first = generateScenarioMeasurements(scenario, model);
    const second = generateScenarioMeasurements(scenario, model);

    expect(second).toEqual(first);
    expect(checksumMeasurementRecords(second)).toBe(
      checksumMeasurementRecords(first)
    );
  });
});

describe("C7 invalid payload fixtures", () => {
  test("contains every required runtime-contract case", () => {
    const fixtureIds = new Set(invalidPayloads.cases.map(({ id }) => id));
    const requiredIds = [
      "missing-pond-id",
      "missing-cycle-id",
      "missing-recorded-at",
      "malformed-recorded-at",
      "missing-parameter-code",
      "unsupported-parameter-code",
      "missing-value",
      "nonnumeric-value",
      "missing-source-type",
      "invalid-unit",
      "incompatible-field-types",
      "malformed-json",
      "nonexistent-pond",
      "cycle-pond-mismatch",
      "duplicate-measurement-identity",
    ];

    for (const requiredId of requiredIds) {
      expect(fixtureIds.has(requiredId)).toBe(true);
    }
    expect(fixtureIds.has("missing-farm-id")).toBe(false);
  });

  test("separates malformed transport bytes from JSON payloads", () => {
    const malformedJson = invalidPayloads.cases.find(
      ({ id }) => id === "malformed-json"
    );

    expect(malformedJson?.category).toBe("transport");
    expect(malformedJson?.rawBody).toBe('{"pondId":1,');
    expect(malformedJson?.body).toBeUndefined();
  });

  test("expects invalid cases not to persist malformed rows", () => {
    for (const fixture of invalidPayloads.cases) {
      if (fixture.id === "duplicate-measurement-identity") {
        expect(fixture.expectedPersistenceDelta).toBe(1);
        expect(fixture.requests).toHaveLength(2);
        continue;
      }
      expect(fixture.expectedPersistenceDelta).toBe(0);
    }
  });

  test("retains a finite unusual value as an accepted control", () => {
    const control = invalidPayloads.acceptedControls.find(
      ({ id }) => id === "finite-unusual-value"
    );

    expect(control?.body.value).toBe(-25);
    expect(control?.expectedPersistenceDelta).toBe(1);
  });
});
