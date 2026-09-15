import { describe, expect, test } from "bun:test";
import { createAnalysisExecutionTimer } from "./execution-timing";

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

describe("Analysis execution timing", () => {
  test("uses only included phases to calculate overhead", async () => {
    const timer = createAnalysisExecutionTimer(
      {
        generateAiSummary: false,
        generateEmbedding: false,
      },
      createClock([100, 101, 104, 105, 107, 108, 112, 115])
    );

    await timer.measureAsync("databaseQuery", async () => "measurements");
    timer.measureSync("deterministicScore", () => 85);
    await timer.measureAsync("persistence", async () => undefined);

    expect(timer.finish()).toEqual({
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
      overheadMs: 6,
      persistenceMs: 4,
      summaryMs: 0,
      totalMs: 15,
    });
  });

  test("does not allow an excluded phase to be measured", () => {
    const timer = createAnalysisExecutionTimer(
      {
        generateAiSummary: false,
        generateEmbedding: true,
      },
      createClock([0])
    );

    expect(() => timer.measureSync("summary", () => "summary")).toThrow(
      "Cannot measure excluded execution phase: summary"
    );
  });
});
