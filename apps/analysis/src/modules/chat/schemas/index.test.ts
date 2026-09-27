import { describe, expect, mock, test } from "bun:test";
import type { AdvisorRetrievalResponse } from ".";

mock.module("database", () => ({
  messageRoles: ["user", "assistant"],
  messageStatuses: ["streaming", "completed", "failed", "aborted"],
}));

const { advisorRetrievalRequestSchema, advisorRetrievalResponseSchema } =
  await import(".");

describe("Advisor retrieval schemas", () => {
  test("accepts and trims a nonempty query within the character limit", () => {
    expect(
      advisorRetrievalRequestSchema.parse({ query: "  pond status  " })
    ).toEqual({
      query: "pond status",
    });
    expect(
      advisorRetrievalRequestSchema.safeParse({ query: "   " }).success
    ).toBe(false);
    expect(
      advisorRetrievalRequestSchema.safeParse({ query: "a".repeat(4001) })
        .success
    ).toBe(false);
  });

  test("allows only retrieval telemetry and candidate metadata", () => {
    const response: AdvisorRetrievalResponse = {
      candidates: [
        {
          analysisId: 42,
          rank: 1,
          similarity: 0.91,
          sourceKey: "S1",
        },
      ],
      config: {
        minimumSimilarity: 0,
        recentResultLimit: 2,
        semanticResultLimit: 5,
      },
      filters: { pondId: 12 },
      queryEmbeddingMs: 25,
      retrievalMs: 40,
      schemaVersion: 1,
      topK: 5,
    };

    expect(advisorRetrievalResponseSchema.parse(response)).toEqual(response);
    expect(
      advisorRetrievalResponseSchema.safeParse({
        ...response,
        prompt: "hidden",
      }).success
    ).toBe(false);
    expect(
      advisorRetrievalResponseSchema.safeParse({
        ...response,
        candidates: [{ ...response.candidates[0], context: "hidden" }],
      }).success
    ).toBe(false);
  });
});
