import { describe, expect, test } from "bun:test";
import type { AdvisorAnalysis } from "../repository/advisor-analyses";
import { createAdvisorSource } from "./source-context";

const createAnalysis = (embeddingContent: string | null): AdvisorAnalysis => ({
  aiSummary: null,
  analysisCreatedAt: new Date("2026-01-03T00:00:00.000Z"),
  analysisId: 42,
  cycleId: 7,
  dissolvedOxygenScore: 80,
  embeddingContent,
  endTime: new Date("2026-01-02T00:00:00.000Z"),
  finalScore: 82,
  metadata: undefined,
  phScore: 83,
  salinityScore: 84,
  startTime: new Date("2026-01-01T00:00:00.000Z"),
  temperatureScore: 81,
});

describe("Advisor source context", () => {
  test("uses approved embedding content when available", () => {
    const source = createAdvisorSource(
      createAnalysis("Approved retrieval context"),
      1,
      0.9
    );

    expect(source.context).toBe("Approved retrieval context");
  });

  test("reconstructs context when approved content is unavailable", () => {
    const source = createAdvisorSource(createAnalysis(null), 1, null);

    expect(source.context).toContain("[S1]");
    expect(source.context).toContain("Identificador da análise: 42");
    expect(source.context).toContain("Pontuação geral: 82.0/100");
  });
});
