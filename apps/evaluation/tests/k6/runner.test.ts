import { describe, expect, test } from "bun:test";
import { buildK6Arguments, parseK6Profile } from "../../src/k6/runner.ts";

const normalizePath = (value: string): string => value.replaceAll("\\", "/");

describe("k6 Bun launcher", () => {
  test("maps only the tracked profiles", () => {
    expect(parseK6Profile("ingestion")).toBe("ingestion");
    expect(parseK6Profile("analysis-7d")).toBe("analysis-7d");
    expect(parseK6Profile("analysis-30d")).toBe("analysis-30d");
    expect(() => parseK6Profile("unknown")).toThrow("k6 profile must be");
  });

  test("places forwarded k6 options before the fixed script path", () => {
    const argumentsValue = buildK6Arguments("ingestion", [
      "--summary-export=results/run/summary.json",
      "--out",
      "json=results/run/metrics.json",
    ]);

    expect(argumentsValue.slice(0, -1)).toEqual([
      "run",
      "--summary-export=results/run/summary.json",
      "--out",
      "json=results/run/metrics.json",
    ]);
    expect(normalizePath(argumentsValue.at(-1) ?? "")).toEndWith(
      "/apps/evaluation/k6/ingestion.js"
    );
  });
});
