import { describe, expect, test } from "bun:test";
import type { MeasurementRecord } from "../../src/shared/types.ts";
import {
  compareMeasurementRecords,
  measurementIdentity,
} from "../../src/validation/measurement-integrity.ts";

const measurement: MeasurementRecord = {
  cycleId: 1,
  parameterCode: "temperature",
  pondId: 1,
  recordedAt: "2026-01-01T00:00:00.000Z",
  sourceType: "manual",
  unit: "°C",
  value: 30,
};

describe("measurement persistence comparison", () => {
  test("uses pond, parameter, and timestamp as identity", () => {
    expect(measurementIdentity(measurement)).toBe(
      "1|temperature|2026-01-01T00:00:00.000Z"
    );
  });

  test("compares all persisted fields with numeric tolerance", () => {
    expect(
      compareMeasurementRecords(
        [measurement],
        [{ ...measurement, value: 30.000_000_5 }]
      ).passed
    ).toBe(true);

    const comparison = compareMeasurementRecords(
      [measurement],
      [{ ...measurement, unit: "pH", value: 31 }]
    );
    expect(comparison.passed).toBe(false);
    expect(comparison.fieldMismatchCount).toBe(2);
    expect(comparison.fieldMismatchSamples.map(({ field }) => field)).toEqual([
      "unit",
      "value",
    ]);
  });

  test("reports missing, unexpected, and duplicate identities", () => {
    const another = {
      ...measurement,
      parameterCode: "ph" as const,
      unit: "pH",
      value: 8,
    };
    const comparison = compareMeasurementRecords(
      [measurement],
      [another, another]
    );

    expect(comparison.passed).toBe(false);
    expect(comparison.missingIdentities).toHaveLength(1);
    expect(comparison.unexpectedIdentities).toHaveLength(1);
    expect(comparison.duplicateActualIdentities).toHaveLength(1);
  });
});
