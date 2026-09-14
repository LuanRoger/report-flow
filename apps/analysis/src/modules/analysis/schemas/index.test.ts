import { describe, expect, test } from "bun:test";
import { analysisBodySchema, analysisGenerationOptionsSchema } from ".";

describe("Analysis request schemas", () => {
  test("enables AI summaries by default", () => {
    expect(analysisGenerationOptionsSchema.parse({})).toEqual({
      generateAiSummary: true,
    });
    expect(analysisBodySchema.parse({})).toEqual({
      generateAiSummary: true,
      window: "7d",
    });
  });

  test("allows callers to disable AI summaries", () => {
    expect(
      analysisBodySchema.parse({ generateAiSummary: false }).generateAiSummary
    ).toBe(false);
  });

  test("requires complete and ordered custom windows", () => {
    expect(
      analysisBodySchema.safeParse({
        startDate: "2026-01-01T00:00:00.000Z",
        window: "custom",
      }).success
    ).toBe(false);
    expect(
      analysisBodySchema.safeParse({
        endDate: "2026-01-01T00:00:00.000Z",
        startDate: "2026-01-02T00:00:00.000Z",
        window: "custom",
      }).success
    ).toBe(false);
  });
});
