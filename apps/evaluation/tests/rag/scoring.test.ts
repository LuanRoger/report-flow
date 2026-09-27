import { describe, expect, test } from "bun:test";
import { scoreAnswerCapture } from "../../src/rag/answers.ts";
import { loadRagGoldCases, parseRagGoldCases } from "../../src/rag/gold.ts";
import {
  materializeCandidateContextIds,
  recallAtK,
  scoreRetrievalCapture,
} from "../../src/rag/retrieval.ts";
import type {
  AnswerExecution,
  RagContextMapping,
  RagGoldCase,
  RetrievalExecution,
} from "../../src/rag/types.ts";

const buildThreeTrials = <Value>(
  cases: readonly RagGoldCase[],
  build: (goldCase: RagGoldCase, trial: number) => Value
): Value[] =>
  cases.flatMap((goldCase) => [1, 2, 3].map((trial) => build(goldCase, trial)));

describe("RAG gold and retrieval scoring", () => {
  test("validates the tracked 40-case distribution", async () => {
    const cases = await loadRagGoldCases();
    expect(cases).toHaveLength(40);
    expect(cases.filter(({ category }) => category === "direct")).toHaveLength(
      10
    );
    expect(() => parseRagGoldCases(cases.slice(1))).toThrow("exactly 40");
  });

  test("materializes symbolic IDs and calculates Recall@5", () => {
    const mappings: RagContextMapping[] = [
      { analysisId: 10, contextId: "ctx:one" },
      { analysisId: 20, contextId: "ctx:two" },
    ];
    const contexts = materializeCandidateContextIds(
      [
        { analysisId: 20, rank: 2, similarity: 0.8, sourceKey: "S2" },
        { analysisId: 10, rank: 1, similarity: 0.9, sourceKey: "S1" },
      ],
      mappings
    );
    expect(contexts).toEqual(["ctx:one", "ctx:two"]);
    expect(recallAtK(["ctx:one", "ctx:missing"], contexts)).toBe(0.5);
    expect(recallAtK([], contexts)).toBeNull();
  });

  test("requires complete trials and preserves missing contexts", async () => {
    const cases = await loadRagGoldCases();
    const contextIds = [
      ...new Set(cases.flatMap(({ expectedContextIds }) => expectedContextIds)),
    ];
    const contextMap = contextIds.map((contextId, index) => ({
      analysisId: index + 1,
      contextId,
    }));
    const analysisByContext = new Map(
      contextMap.map(({ analysisId, contextId }) => [contextId, analysisId])
    );
    const executions = buildThreeTrials<RetrievalExecution>(
      cases,
      (goldCase, trial) => ({
        candidates: goldCase.expectedContextIds.map((contextId, index) => ({
          analysisId: analysisByContext.get(contextId),
          rank: index + 1,
          similarity: 0.9,
          sourceKey: `S${index + 1}`,
        })),
        caseId: goldCase.id,
        pondId: goldCase.pondId,
        queryEmbeddingMs: 10,
        retrievalMs: 5,
        topK: 5,
        trial,
      })
    );
    const result = scoreRetrievalCapture(
      { contextMap, executions, schemaVersion: 1 },
      cases
    );
    expect(result.completeThreeTrialsPerCase).toBe(true);
    expect(result.answerableExecutionCount).toBe(90);
    expect(result.meanRecallAt5).toBe(1);
    expect(result.passed).toBe(true);
  });
});

describe("RAG answer scoring", () => {
  test("scores facts, claims, abstention, and latency", async () => {
    const cases = await loadRagGoldCases();
    const executions = buildThreeTrials<AnswerExecution>(
      cases,
      (goldCase, trial) => ({
        caseId: goldCase.id,
        claims: goldCase.mustAbstain
          ? []
          : [
              {
                sourceContextIds: goldCase.expectedContextIds,
                supported: true,
                text: "Supported test claim",
                verifiable: true,
              },
            ],
        explicitAbstention: goldCase.mustAbstain,
        observedFacts: Object.fromEntries(
          goldCase.expectedFacts.map(({ expectedValue, field }) => [
            field,
            expectedValue,
          ])
        ),
        responseText: goldCase.mustAbstain
          ? "Não há informações suficientes para responder com segurança."
          : "Resposta fundamentada.",
        totalMs: 1000,
        trial,
        ttftMs: 500,
      })
    );
    const result = scoreAnswerCapture(
      {
        executions,
        judge: { method: "human-review", model: null, promptChecksum: null },
        schemaVersion: 1,
      },
      cases
    );

    expect(result.factualAccuracy.rate).toBe(1);
    expect(result.groundedness.rate).toBe(1);
    expect(result.abstention.rate).toBe(1);
    expect(result.completeThreeTrialsPerCase).toBe(true);
    expect(result.passed).toBe(true);
  });
});
