import { describe, expect, test } from "bun:test";
import {
  analysisBodySchema,
  analysisGenerationOptionsSchema,
  executionTimingsSchema,
  getAnalysesByPond200ResponseSchema,
} from ".";

describe("Analysis request schemas", () => {
  test("enables external artifacts by default", () => {
    expect(analysisGenerationOptionsSchema.parse({})).toEqual({
      generateAiSummary: true,
      generateEmbedding: true,
      maximumContinuityGapSeconds: 20,
    });
    expect(analysisBodySchema.parse({})).toEqual({
      generateAiSummary: true,
      generateEmbedding: true,
      maximumContinuityGapSeconds: 20,
      window: "7d",
    });
  });

  test("allows callers to disable external artifacts", () => {
    expect(
      analysisBodySchema.parse({
        generateAiSummary: false,
        generateEmbedding: false,
      })
    ).toMatchObject({
      generateAiSummary: false,
      generateEmbedding: false,
    });
  });

  test("accepts a positive continuity-gap override", () => {
    expect(
      analysisBodySchema.parse({ maximumContinuityGapSeconds: 90 })
        .maximumContinuityGapSeconds
    ).toBe(90);
    expect(
      analysisBodySchema.safeParse({ maximumContinuityGapSeconds: 0 }).success
    ).toBe(false);
  });

  test("represents skipped timing phases explicitly", () => {
    const timings = {
      databaseQueryMs: 3,
      deterministicScoreMs: 2,
      embeddingMs: 0,
      includedPhases: {
        databaseQuery: true,
        deterministicScore: true,
        embedding: false,
        persistence: true,
        serialization: false,
        summary: false,
      },
      overheadMs: 1,
      persistenceMs: 4,
      summaryMs: 0,
      totalMs: 10,
    } as const;

    expect(executionTimingsSchema.parse(timings)).toEqual(timings);
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

  test("validates compact analysis list items", () => {
    const result = getAnalysesByPond200ResponseSchema.parse([
      {
        createdAt: "2026-09-27T12:00:00.000Z",
        cycleId: null,
        dissolvedOxygenScore: 88,
        endTime: "2026-09-27T12:00:00.000Z",
        finalScore: 84,
        id: 42,
        phScore: 83,
        pondId: 7,
        salinityScore: 79,
        startTime: "2026-09-20T12:00:00.000Z",
        temperatureScore: 86,
      },
    ]);

    expect(result[0]?.createdAt).toBeInstanceOf(Date);
    expect(result[0]?.id).toBe(42);
  });
});
