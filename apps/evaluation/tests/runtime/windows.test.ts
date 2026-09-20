import { describe, expect, test } from "bun:test";
import { resolveBenchmarkWindow } from "../../src/benchmark/windows.ts";

const bounds = {
  firstRecordedAt: "2026-02-01T00:00:00.000Z",
  lastRecordedAt: "2026-03-02T23:55:00.000Z",
  pondId: 1,
  rowCount: 8640,
  sourceFiles: ["evaluation:1-pond-30-days"],
};

describe("benchmark windows", () => {
  test("uses the exclusive instant after the final reading", () => {
    expect(resolveBenchmarkWindow(bounds, 7)).toEqual({
      days: 7,
      end: "2026-03-03T00:00:00.000Z",
      start: "2026-02-24T00:00:00.000Z",
    });
  });

  test("rejects windows outside the available data", () => {
    expect(() => resolveBenchmarkWindow(bounds, 31)).toThrow(
      "outside available pond data"
    );
  });
});
