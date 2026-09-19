import { describe, expect, test } from "bun:test";
import {
  extractInlineCitations,
  summarizeAnswerEvents,
  validateMonotonicEventOffsets,
} from "../../src/rag/answer-capture.ts";
import {
  parseLiveRetrievalResponse,
  parsePreparedRagContextMap,
  RAG_CAPTURE_TRIALS,
  validateCompleteCaseTrials,
  validatePreparedRagContextMap,
} from "../../src/rag/capture-validation.ts";
import { loadRagGoldCases } from "../../src/rag/gold.ts";
import {
  parseSseText,
  type TimedSseEvent,
} from "../../src/runtime/http-stream.ts";

const timedEvents = (sse: string): TimedSseEvent[] =>
  parseSseText(sse).map((event, sequence) => ({
    ...event,
    offsetMs: sequence + 1,
    sequence,
  }));

describe("AI SDK SSE capture", () => {
  test("parses SSE fields and multiline data without an SDK dependency", () => {
    const events = parseSseText(
      ': keepalive\r\nid: event-1\r\nevent: message\r\ndata: {"type":"start",\r\ndata: "messageId":"m1"}\r\n\r\ndata: [DONE]\r\n\r\n'
    );

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      event: "message",
      id: "event-1",
      value: { messageId: "m1", type: "start" },
    });
    expect(events[1]?.data).toBe("[DONE]");
    expect(events[1]?.value).toBeNull();
  });

  test("concatenates text deltas and captures emitted sources and citations", () => {
    const events = timedEvents(
      [
        'data: {"type":"start","messageId":"assistant-1"}',
        "",
        'data: {"type":"source-document","sourceId":"S1","mediaType":"application/vnd.report-flow.analysis","title":"Analysis one"}',
        "",
        'data: {"type":"start-step"}',
        "",
        'data: {"type":"text-delta","id":"text-1","delta":"Result [S1]"}',
        "",
        'data: {"type":"text-delta","id":"text-1","delta":" and unknown [S9]."}',
        "",
        'data: {"type":"error","errorText":"provider warning"}',
        "",
        "data: [DONE]",
        "",
      ].join("\n")
    );
    const summary = summarizeAnswerEvents(events);

    expect(summary.responseText).toBe("Result [S1] and unknown [S9].");
    expect(summary.sources).toEqual([
      {
        mediaType: "application/vnd.report-flow.analysis",
        sourceId: "S1",
        title: "Analysis one",
        url: null,
      },
    ]);
    expect(summary.citations).toEqual(["S1", "S9"]);
    expect(summary.errors).toEqual([
      "provider warning",
      "Citation references an unemitted source: S9",
    ]);
    expect(summary.firstProviderMs).toBe(3);
    expect(summary.firstTextMs).toBe(4);
    expect(extractInlineCitations("[S1] [S1] [ctx:one]")).toEqual([
      "S1",
      "ctx:one",
    ]);
    expect(() => validateMonotonicEventOffsets(events)).not.toThrow();
    const [firstEvent, secondEvent] = events;
    if (!(firstEvent && secondEvent)) {
      throw new Error("SSE fixture requires at least two events");
    }
    expect(() =>
      validateMonotonicEventOffsets([
        { ...firstEvent, offsetMs: 2 },
        { ...secondEvent, offsetMs: 1 },
      ])
    ).toThrow("monotonic");
  });
});

describe("live RAG capture validation", () => {
  test("requires one-to-one prepared mappings and topK=5", async () => {
    const goldCases = await loadRagGoldCases();
    const contextIds = [
      ...new Set(
        goldCases.flatMap(({ expectedContextIds }) => expectedContextIds)
      ),
    ];
    const value = {
      contextMap: contextIds.map((contextId, index) => ({
        analysisId: index + 100,
        contextId,
        sourceKey: `prepared-${index + 1}`,
      })),
      pondMap: [{ logicalPondId: 1, pondId: 501 }],
      schemaVersion: 1,
      topK: 5,
    };
    const contextMap = parsePreparedRagContextMap(value);
    const recordContextMap = parsePreparedRagContextMap({
      contexts: Object.fromEntries(
        value.contextMap.map(({ analysisId, contextId, sourceKey }) => [
          contextId,
          { analysisId, sourceKey },
        ])
      ),
      pondMap: { "1": 501 },
      schemaVersion: 1,
    });

    expect(recordContextMap.contextMap).toEqual(contextMap.contextMap);
    expect(() =>
      validatePreparedRagContextMap(contextMap, goldCases)
    ).not.toThrow();
    expect(() => parsePreparedRagContextMap({ ...value, topK: 4 })).toThrow(
      "topK must equal 5"
    );
    expect(() =>
      parsePreparedRagContextMap({
        ...value,
        contextMap: [
          value.contextMap[0],
          {
            ...value.contextMap[1],
            analysisId: value.contextMap[0]?.analysisId,
          },
        ],
      })
    ).toThrow("one-to-one");
  });

  test("normalizes a direct retrieval response and rejects a changed topK", () => {
    const identity = {
      caseId: "rag-direct-01",
      logicalPondId: 1,
      physicalPondId: 501,
      trial: 2,
    };
    const response = {
      candidates: [
        { analysisId: 101, rank: 1, similarity: 0.91, sourceKey: "S1" },
      ],
      filters: { pondId: 501 },
      timings: { queryEmbeddingMs: 12, retrievalMs: 4 },
      topK: 5,
    };

    expect(parseLiveRetrievalResponse(response, identity)).toEqual({
      candidates: [
        { analysisId: 101, rank: 1, similarity: 0.91, sourceKey: "S1" },
      ],
      caseId: "rag-direct-01",
      pondId: 1,
      queryEmbeddingMs: 12,
      retrievalMs: 4,
      topK: 5,
      trial: 2,
    });
    expect(() =>
      parseLiveRetrievalResponse({ ...response, topK: 10 }, identity)
    ).toThrow("topK must equal 5");
  });

  test("requires exactly one execution for every case and trial", async () => {
    const goldCases = await loadRagGoldCases();
    const executions = goldCases.flatMap(({ id }) =>
      RAG_CAPTURE_TRIALS.map((trial) => ({ caseId: id, trial }))
    );

    expect(() =>
      validateCompleteCaseTrials(executions, goldCases, "capture")
    ).not.toThrow();
    expect(() =>
      validateCompleteCaseTrials(executions.slice(1), goldCases, "capture")
    ).toThrow("exactly three trials");
    const [duplicateExecution] = executions;
    if (!duplicateExecution) {
      throw new Error("Capture fixture requires at least one execution");
    }
    expect(() =>
      validateCompleteCaseTrials(
        [...executions, duplicateExecution],
        goldCases,
        "capture"
      )
    ).toThrow("duplicate");
  });
});
