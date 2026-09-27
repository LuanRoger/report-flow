import { describe, expect, test } from "bun:test";
import {
  buildMeasurementInsert,
  maximumSafeMeasurementBatchSize,
} from "../../src/runtime/measurements.ts";
import type { MeasurementRecord } from "../../src/shared/types.ts";

const measurement: MeasurementRecord = {
  cycleId: 1,
  parameterCode: "temperature",
  pondId: 1,
  recordedAt: "2026-01-01T00:00:00.000Z",
  sourceType: "manual",
  unit: "°C",
  value: 30,
};

describe("measurement bulk insertion", () => {
  test("uses parameterized bounded rows and records provenance", () => {
    const insertion = buildMeasurementInsert(
      [
        measurement,
        { ...measurement, parameterCode: "ph", unit: "pH", value: 8 },
      ],
      "evaluation:test"
    );

    expect(insertion.statement).toContain(
      "INSERT INTO measurements (pond_id, cycle_id, recorded_at"
    );
    expect(insertion.statement).toContain("($1, $2, $3, $4, $5, $6, $7, $8)");
    expect(insertion.statement).toContain(
      "($9, $10, $11, $12, $13, $14, $15, $16)"
    );
    expect(insertion.bindings).toHaveLength(16);
    expect(insertion.bindings[7]).toBe("evaluation:test");
  });

  test("stays below PostgreSQL binding limits", () => {
    expect(maximumSafeMeasurementBatchSize()).toBe(7500);
    expect(() =>
      buildMeasurementInsert(
        Array.from({ length: 7501 }, () => measurement),
        "evaluation:test"
      )
    ).toThrow("maximum is 60000");
  });
});
