import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  CreateAnalysisEmbedding,
  CreateAnalysisResult,
  Measurement,
} from "../repository/types";
import {
  analysisGenerationOptionsSchema,
  performAnalysisByCycle200ResponseSchema,
} from "../schemas";
import type { ScoreResult } from "../schemas/types";
import { createAnalysisExecutionTimer } from "../utils/execution-timing";

const RECORDED_AT = new Date("2026-01-01T00:00:00.000Z");
const MEASUREMENT_VALUES = [
  {
    parameterCode: "dissolvedOxygen",
    unit: "mg/L",
    value: 5,
  },
  {
    parameterCode: "temperature",
    unit: "°C",
    value: 30,
  },
  {
    parameterCode: "ph",
    unit: "pH",
    value: 8,
  },
  {
    parameterCode: "salinity",
    unit: "ppt",
    value: 20,
  },
] as const;
const measurements = MEASUREMENT_VALUES.map(
  (measurement, index): Measurement => ({
    ...measurement,
    createdAt: RECORDED_AT,
    cycleId: 7,
    id: index + 1,
    pondId: 3,
    recordedAt: RECORDED_AT,
    sourceFile: null,
    sourceType: "test",
  })
);

const generateAiSummaryMock = mock(
  async (_result: ScoreResult): Promise<string> => "Generated summary"
);
const formatAnalysisForEmbeddingMock = mock(
  (_result: ScoreResult): string => "Embedding content"
);
const generateEmbeddingMock = mock(
  async (_content: string): Promise<number[]> => [0.1]
);
const getMeasurementsForCycleMock = mock(
  async (_cycleId: number): Promise<Measurement[]> => measurements
);
const storeAnalysisResultMock = mock(
  async (
    _result: CreateAnalysisResult,
    _embeddingData: CreateAnalysisEmbedding | null,
    _aiSummary: string | null
  ): Promise<void> => undefined
);

mock.module("../repository", () => ({
  deleteAnalysisById: mock(async () => undefined),
  getAnalysisById: mock(async () => undefined),
  getMeasurementsForCycle: getMeasurementsForCycleMock,
  getMeasurementsForPond: mock(async () => measurements),
  getPondById: mock(async () => ({ id: 3 })),
  storeAnalysisResult: storeAnalysisResultMock,
}));

mock.module("../utils/ai-summary", () => ({
  generateAiSummary: generateAiSummaryMock,
}));

mock.module("../utils/rag", () => ({
  formatAnalysisForEmbedding: formatAnalysisForEmbeddingMock,
  generateEmbedding: generateEmbeddingMock,
}));

const { performAnalysisByCycle, storeAnalysisScoreResult } = await import(".");

describe("Analysis artifact controls", () => {
  beforeEach(() => {
    formatAnalysisForEmbeddingMock.mockClear();
    generateAiSummaryMock.mockClear();
    generateEmbeddingMock.mockClear();
    getMeasurementsForCycleMock.mockClear();
    storeAnalysisResultMock.mockClear();
  });

  test("persists deterministic cycle analysis without OpenAI artifacts", async () => {
    const options = analysisGenerationOptionsSchema.parse({
      generateAiSummary: false,
      generateEmbedding: false,
    });
    const executionTimer = createAnalysisExecutionTimer(options);

    const result = await performAnalysisByCycle(7, options, executionTimer);
    await storeAnalysisScoreResult(result, 7, {
      executionTimer,
      generateEmbedding: options.generateEmbedding,
    });
    const response = {
      ...result,
      executionTimings: executionTimer.finish(),
    };

    expect(getMeasurementsForCycleMock).toHaveBeenCalledWith(7);
    expect(generateAiSummaryMock).not.toHaveBeenCalled();
    expect(formatAnalysisForEmbeddingMock).not.toHaveBeenCalled();
    expect(generateEmbeddingMock).not.toHaveBeenCalled();
    expect(storeAnalysisResultMock).toHaveBeenCalledTimes(1);
    expect(storeAnalysisResultMock.mock.calls[0]?.[1]).toBeNull();
    expect(storeAnalysisResultMock.mock.calls[0]?.[2]).toBeNull();
    expect(storeAnalysisResultMock.mock.calls[0]?.[0].metadata).toBe(
      result.metadata
    );
    expect(storeAnalysisResultMock.mock.calls[0]?.[0]).not.toHaveProperty(
      "executionTimings"
    );
    expect(response.executionTimings.embeddingMs).toBe(0);
    expect(response.executionTimings.summaryMs).toBe(0);
    expect(response.executionTimings.includedPhases.embedding).toBe(false);
    expect(response.executionTimings.includedPhases.serialization).toBe(false);
    expect(response.executionTimings.includedPhases.summary).toBe(false);
    expect(() =>
      performAnalysisByCycle200ResponseSchema.parse(response)
    ).not.toThrow();
  });

  test("generates both external artifacts by default", async () => {
    const result = await performAnalysisByCycle(7);

    await storeAnalysisScoreResult(result, 7);

    expect(generateAiSummaryMock).toHaveBeenCalledTimes(1);
    expect(formatAnalysisForEmbeddingMock).toHaveBeenCalledWith(result);
    expect(generateEmbeddingMock).toHaveBeenCalledWith("Embedding content");
    expect(storeAnalysisResultMock.mock.calls[0]?.[1]).toEqual({
      content: "Embedding content",
      embedding: [0.1],
    });
    expect(storeAnalysisResultMock.mock.calls[0]?.[2]).toBe(
      "Generated summary"
    );
  });
});
