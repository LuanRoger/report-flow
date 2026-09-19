import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AdvisorAnalysis } from "../repository/advisor-analyses";

const QUERY_EMBEDDING = [0.1, 0.2];

const generateEmbeddingMock = mock(
  async (_query: string): Promise<number[]> => QUERY_EMBEDDING
);
const findRecentAnalysesForPondMock = mock(
  async (_pondId: number, _limit: number): Promise<AdvisorAnalysis[]> => []
);
const findSemanticallyRelevantAnalysesForPondMock = mock(
  async (
    _pondId: number,
    _queryEmbedding: number[],
    _limit: number,
    _minimumSimilarity: number
  ): Promise<Array<AdvisorAnalysis & { similarity: number }>> => []
);

mock.module("../../analysis/utils/rag", () => ({
  generateEmbedding: generateEmbeddingMock,
}));

mock.module("../repository/advisor-analyses", () => ({
  findRecentAnalysesForPond: findRecentAnalysesForPondMock,
  findSemanticallyRelevantAnalysesForPond:
    findSemanticallyRelevantAnalysesForPondMock,
}));

const { retrieveAdvisorSources } = await import("./retrieval");

const createAnalysis = (
  analysisId: number,
  embeddingContent: string | null = `Approved content ${analysisId}`
): AdvisorAnalysis => ({
  aiSummary: null,
  analysisCreatedAt: new Date("2026-01-03T00:00:00.000Z"),
  analysisId,
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

const createClock = (timestamps: number[]): (() => number) => {
  let nextTimestampIndex = 0;

  return () => {
    const timestamp = timestamps[nextTimestampIndex];
    if (timestamp === undefined) {
      throw new Error("Test clock ran out of timestamps");
    }

    nextTimestampIndex += 1;
    return timestamp;
  };
};

describe("Advisor retrieval", () => {
  beforeEach(() => {
    generateEmbeddingMock.mockClear();
    findRecentAnalysesForPondMock.mockClear();
    findSemanticallyRelevantAnalysesForPondMock.mockClear();
    generateEmbeddingMock.mockImplementation(
      async (_query: string): Promise<number[]> => QUERY_EMBEDDING
    );
    findRecentAnalysesForPondMock.mockImplementation(
      async (_pondId: number, _limit: number): Promise<AdvisorAnalysis[]> => []
    );
    findSemanticallyRelevantAnalysesForPondMock.mockImplementation(
      async (
        _pondId: number,
        _queryEmbedding: number[],
        _limit: number,
        _minimumSimilarity: number
      ): Promise<Array<AdvisorAnalysis & { similarity: number }>> => []
    );
  });

  test("measures total retrieval and embedding while preserving candidate order", async () => {
    const firstAnalysis = createAnalysis(1);
    const secondAnalysis = createAnalysis(2);
    const thirdAnalysis = createAnalysis(3);
    findRecentAnalysesForPondMock.mockImplementation(async () => [
      firstAnalysis,
      { ...firstAnalysis },
      secondAnalysis,
    ]);
    findSemanticallyRelevantAnalysesForPondMock.mockImplementation(async () => [
      { ...secondAnalysis, similarity: 0.9 },
      { ...thirdAnalysis, similarity: 0.8 },
    ]);

    const result = await retrieveAdvisorSources(
      12,
      "water quality",
      createClock([100, 102, 112, 125])
    );

    expect(result.timings).toEqual({
      queryEmbeddingMs: 10,
      retrievalMs: 25,
    });
    expect(
      result.sources.map(({ analysisId, rank, similarity }) => ({
        analysisId,
        rank,
        similarity,
      }))
    ).toEqual([
      { analysisId: 1, rank: 1, similarity: null },
      { analysisId: 2, rank: 2, similarity: 0.9 },
      { analysisId: 3, rank: 3, similarity: 0.8 },
    ]);
    expect(findSemanticallyRelevantAnalysesForPondMock).toHaveBeenCalledWith(
      12,
      QUERY_EMBEDDING,
      4,
      0.5
    );
  });

  test("starts the recent lookup before query embedding completes", async () => {
    let resolveEmbedding: ((embedding: number[]) => void) | undefined;
    generateEmbeddingMock.mockImplementation(
      async () =>
        await new Promise<number[]>((resolve) => {
          resolveEmbedding = resolve;
        })
    );

    const retrieval = retrieveAdvisorSources(
      12,
      "water quality",
      createClock([0, 1, 5, 8])
    );

    expect(findRecentAnalysesForPondMock).toHaveBeenCalledTimes(1);
    expect(findSemanticallyRelevantAnalysesForPondMock).not.toHaveBeenCalled();
    resolveEmbedding?.(QUERY_EMBEDDING);
    await retrieval;

    expect(findSemanticallyRelevantAnalysesForPondMock).toHaveBeenCalledTimes(
      1
    );
  });
});
