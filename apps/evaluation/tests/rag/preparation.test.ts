import { describe, expect, test } from "bun:test";
import { evaluateScenario } from "../../src/oracle/scenario.ts";
import {
  CONTROLLED_CONTEXT_IDS,
  CONTROLLED_MEASUREMENT_COUNT,
  type ControlledContextCatalog,
  loadControlledContextCatalog,
} from "../../src/rag/catalog.ts";
import { evaluateControlledScenario } from "../../src/rag/controlled-oracle.ts";
import type { EmbeddingProvider } from "../../src/rag/embedding.ts";
import {
  type ApprovedContextDocument,
  analyzeControlledContexts,
  buildApprovedContextDocuments,
  embedAndPersistApprovedContexts,
  generateControlledMeasurements,
  requestControlledAnalysis,
  resetAndSeedControlledCatalog,
} from "../../src/rag/preparation.ts";
import type { SqlClient, SqlRow } from "../../src/runtime/database.ts";
import { sanitizeHttpBaseUrl } from "../../src/runtime/environment.ts";
import { expectedScenarioRowCount } from "../../src/seed/generator/scenario.ts";
import { loadModelConfig } from "../../src/shared/config.ts";
import type { ModelConfig } from "../../src/shared/types.ts";
import { PARAMETER_CODES } from "../../src/shared/types.ts";

const [catalog, model] = await Promise.all([
  loadControlledContextCatalog(),
  loadModelConfig(),
]);

const c6Catalog = (): ControlledContextCatalog => ({
  ...catalog,
  contexts: catalog.contexts.slice(6, 8),
});

const responseFromOracle = (
  context: ControlledContextCatalog["contexts"][number],
  modelConfig: ModelConfig
): Record<string, unknown> => {
  const { evaluation } = evaluateScenario(context.scenario, modelConfig);
  const parameterScores: Record<string, number> = {};
  const parameterStats: Record<string, unknown> = {};
  const parameterCoverage: Record<string, unknown> = {};
  const measurementsByParameter: Record<string, number> = {};
  let totalMeasurements = 0;

  for (const parameterCode of PARAMETER_CODES) {
    const result = evaluation.parameterResults[parameterCode];
    if (
      result.temporalScore === null ||
      result.durationWeightedMean === null ||
      result.pLow === null
    ) {
      throw new Error("Controlled test fixture requires complete scores");
    }
    const rawValues = result.rawReadings.map(({ value }) => value);
    const rawTotal = rawValues.reduce((total, value) => total + value, 0);
    parameterScores[parameterCode] = result.temporalScore;
    parameterStats[parameterCode] = {
      normalizedScores: {
        count: result.normalizedReadings.length,
        max: Math.max(...result.normalizedReadings.map(({ score }) => score)),
        mean:
          result.normalizedReadings.reduce(
            (total, { score }) => total + score,
            0
          ) / result.normalizedReadings.length,
        min: Math.min(...result.normalizedReadings.map(({ score }) => score)),
      },
      rawValues: {
        count: rawValues.length,
        max: Math.max(...rawValues),
        mean: rawTotal / rawValues.length,
        min: Math.min(...rawValues),
      },
      temporalMetrics: {
        coveragePercentage: result.coverage * 100,
        coveredDurationSeconds: result.coveredDurationSeconds,
        missingDurationSeconds: result.missingDurationSeconds,
        pLow: result.pLow,
        unfavorableDurationSeconds: result.unfavorableDurationSeconds,
        unfavorableIntervals: result.representedIntervals
          .filter(({ unfavorable }) => unfavorable)
          .map(({ durationSeconds, end, start }) => ({
            durationSeconds,
            end,
            start,
          })),
        weightedMeanScore: result.durationWeightedMean,
      },
    };
    parameterCoverage[parameterCode] = {
      coveragePercentage: result.coverage * 100,
      coveredDurationSeconds: result.coveredDurationSeconds,
      missingDurationSeconds: result.missingDurationSeconds,
    };
    measurementsByParameter[parameterCode] = result.rawReadings.length;
    totalMeasurements += result.rawReadings.length;
  }

  return {
    aiSummary: null,
    endDate: context.scenario.end,
    executionTimings: {
      databaseQueryMs: 1,
      deterministicScoreMs: 1,
      embeddingMs: 0,
      includedPhases: {
        databaseQuery: true,
        deterministicScore: true,
        embedding: false,
        persistence: true,
        serialization: false,
        summary: false,
      },
      overheadMs: 0,
      persistenceMs: 1,
      summaryMs: 0,
      totalMs: 3,
    },
    finalScore: evaluation.finalScore,
    metadata: {
      criticalThreshold: modelConfig.unfavorableThreshold,
      executionStats: {
        dataCoverage: {
          coveragePercentage: evaluation.overallCoverage * 100,
          hasSufficientCoverage: evaluation.hasSufficientCoverage,
          minimumRequiredPercentage:
            modelConfig.temporal.minimumCoveragePerParameter * 100,
          missingParameters: [],
          parameterCoverage,
          presentParameters: [...PARAMETER_CODES],
        },
        measurementsByParameter,
        timeRange: {
          actualEnd: context.scenario.end,
          actualStart: context.scenario.start,
          requestedEnd: context.scenario.end,
          requestedStart: context.scenario.start,
        },
        totalMeasurements,
      },
      maximumContinuityGapSeconds: evaluation.maximumContinuityGapSeconds,
      minimumCoveragePercentage:
        modelConfig.temporal.minimumCoveragePerParameter * 100,
      parameterStats,
      parameterWeights: modelConfig.weights,
      scoringModelVersion: modelConfig.modelVersion,
      windowConvention: "[start,end)",
    },
    parameterScores,
    pondId: context.scenario.pondId,
    startDate: context.scenario.start,
  };
};

const createAnalysisClient = (persistedCycles: Set<number>): SqlClient => ({
  close: (): Promise<void> => Promise.resolve(),
  query: <Row extends SqlRow>(
    statement: string,
    bindings: readonly unknown[] = []
  ): Promise<Row[]> => {
    if (statement.startsWith("SELECT id FROM analysis_results")) {
      const cycleId = Number(bindings[1]);
      const rows = persistedCycles.has(cycleId) ? [{ id: cycleId + 100 }] : [];
      return Promise.resolve(rows as unknown as Row[]);
    }
    if (statement.includes("COUNT(*) AS row_count")) {
      return Promise.resolve([{ row_count: 0 }] as unknown as Row[]);
    }
    return Promise.reject(
      new Error(`Unexpected SQL in analysis test: ${statement}`)
    );
  },
});

const createEmbeddingClient = (): {
  client: SqlClient;
  insertedAnalysisIds: number[];
} => {
  const counts = new Map<number, number>();
  const insertedAnalysisIds: number[] = [];
  return {
    client: {
      close: (): Promise<void> => Promise.resolve(),
      query: <Row extends SqlRow>(
        statement: string,
        bindings: readonly unknown[] = []
      ): Promise<Row[]> => {
        const analysisId = Number(bindings[0]);
        if (statement.startsWith("SELECT COUNT(*)")) {
          const rows = [{ row_count: counts.get(analysisId) ?? 0 }];
          return Promise.resolve(rows as unknown as Row[]);
        }
        if (statement.startsWith("INSERT INTO analysis_embeddings")) {
          counts.set(analysisId, (counts.get(analysisId) ?? 0) + 1);
          insertedAnalysisIds.push(analysisId);
          return Promise.resolve([]);
        }
        return Promise.reject(
          new Error(`Unexpected SQL in embedding test: ${statement}`)
        );
      },
    },
    insertedAnalysisIds,
  };
};

const embeddingProvider = (calls: string[]): EmbeddingProvider => ({
  dimensions: 1024,
  embed: (content: string): Promise<readonly number[]> => {
    calls.push(content);
    return Promise.resolve(
      Array.from({ length: 1024 }, (_, index) => index / 1024)
    );
  },
  model: "text-embedding-3-small",
});

describe("controlled RAG catalog", () => {
  test("freezes the documented nine contexts and exact row total", () => {
    expect(catalog.contexts.map(({ contextId }) => contextId)).toEqual([
      ...CONTROLLED_CONTEXT_IDS,
    ]);
    expect(catalog.contexts.map(({ scenario }) => scenario.pondId)).toEqual(
      Array.from({ length: 9 }, () => 1)
    );
    expect(catalog.contexts.map(({ scenario }) => scenario.cycleId)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect(
      catalog.contexts.reduce(
        (total, { scenario }) => total + expectedScenarioRowCount(scenario),
        0
      )
    ).toBe(CONTROLLED_MEASUREMENT_COUNT);
  });

  test("evaluates long cadence periods without materializing their rows", () => {
    const sevenDayC4 = catalog.contexts.find(
      ({ contextId }) => contextId === "ctx:c4:pond-001:7d:p05"
    );
    const thirtyDayC4 = catalog.contexts.find(
      ({ contextId }) => contextId === "ctx:c4:pond-001:30d:p09"
    );
    if (!(sevenDayC4 && thirtyDayC4)) {
      throw new Error("Missing controlled C4 contexts");
    }
    const sevenDayOracle = evaluateControlledScenario(
      sevenDayC4.scenario,
      model
    );
    const thirtyDayOracle = evaluateControlledScenario(
      thirtyDayC4.scenario,
      model
    );

    expect(
      sevenDayOracle.parameterResults.dissolvedOxygen.unfavorableDurationSeconds
    ).toBe(21_600);
    expect(
      thirtyDayOracle.parameterResults.dissolvedOxygen
        .unfavorableDurationSeconds
    ).toBe(21_600);
    expect(sevenDayOracle.finalScore).not.toBe(thirtyDayOracle.finalScore);
    expect(
      sevenDayOracle.parameterResults.dissolvedOxygen.representedIntervals
        .filter(({ unfavorable }) => unfavorable)
        .map(({ end, start }) => ({ end, start }))
    ).toEqual([
      {
        end: "2026-02-03T12:00:00.000Z",
        start: "2026-02-03T06:00:00.000Z",
      },
    ]);
  });

  test("streams only the small irregular contexts in unit tests", () => {
    const [c6a, c6b] = c6Catalog().contexts;
    if (!(c6a && c6b)) {
      throw new Error("Missing C6 controlled contexts");
    }

    expect(Array.from(generateControlledMeasurements(c6a, model))).toHaveLength(
      32
    );
    expect(Array.from(generateControlledMeasurements(c6b, model))).toHaveLength(
      35
    );
  });
});

describe("controlled RAG safety and analysis", () => {
  test("guards reset before opening a database connection", () => {
    expect(
      resetAndSeedControlledCatalog(catalog, model, {
        confirmReset: false,
        databaseUrl:
          "postgresql://evaluation:secret@localhost:5432/report_flow_evaluation",
      })
    ).rejects.toThrow("--confirm-reset");
  });

  test("sends deterministic production analysis controls", async () => {
    const [context] = c6Catalog().contexts;
    if (!context) {
      throw new Error("Missing C6-A context");
    }
    const originalFetch = globalThis.fetch;
    let capturedBody: unknown;
    let capturedUrl = "";
    globalThis.fetch = ((
      input: string | URL | Request,
      init?: RequestInit
    ): Promise<Response> => {
      capturedUrl = String(input);
      capturedBody = JSON.parse(String(init?.body)) as unknown;
      return Promise.resolve(new Response("{}", { status: 200 }));
    }) as typeof fetch;

    try {
      await requestControlledAnalysis(context, 90, {
        apiKey: "test-analysis-key",
        runId: "test-run",
        target: sanitizeHttpBaseUrl("http://localhost:3001"),
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(capturedUrl).toBe("http://localhost:3001/analyses/cycles/7");
    expect(capturedBody).toEqual({
      generateAiSummary: false,
      generateEmbedding: false,
      maximumContinuityGapSeconds: 90,
    });
  });

  test("analyzes sequentially with exact continuity caps and oracle checks", async () => {
    const smallCatalog = c6Catalog();
    const persistedCycles = new Set<number>();
    const requestOrder: number[] = [];
    const continuityCaps: number[] = [];
    const results = await analyzeControlledContexts(
      createAnalysisClient(persistedCycles),
      smallCatalog,
      model,
      {
        apiKey: "test-analysis-key",
        runId: "test-run",
        target: sanitizeHttpBaseUrl("http://localhost:3001"),
      },
      (context, maximumContinuityGapSeconds) => {
        requestOrder.push(context.scenario.cycleId);
        continuityCaps.push(maximumContinuityGapSeconds);
        persistedCycles.add(context.scenario.cycleId);
        const responseBody = responseFromOracle(context, model);
        return Promise.resolve({
          durationMs: 1,
          ok: true,
          responseBody,
          responseText: JSON.stringify(responseBody),
          status: 200,
        });
      }
    );

    expect(requestOrder).toEqual([7, 8]);
    expect(continuityCaps).toEqual([90, 20]);
    expect(results.map(({ analysisId }) => analysisId)).toEqual([107, 108]);
    expect(results.every(({ comparison }) => comparison.passed)).toBe(true);

    const documents = buildApprovedContextDocuments(
      results,
      smallCatalog,
      model
    );
    const firstDocument = documents[0]?.document as {
      configuration: { model: { modelVersion: string } };
      evidence: {
        parameters: {
          dissolvedOxygen: { missingIntervals: unknown[] };
        };
      };
      identity: { contextId: string; scenarioId: string };
    };
    expect(documents[0]?.content).toStartWith("Pond analysis context C6-A (");
    expect(documents[0]?.content).toContain(
      "This context contains the final pond score"
    );
    expect(firstDocument.identity).toEqual(
      expect.objectContaining({
        contextId: "ctx:c6-a:pond-001:100s:p07",
        scenarioId: "C6-A",
      })
    );
    expect(firstDocument.configuration.model.modelVersion).toBe(
      "tcc-frozen-evaluation-v1"
    );
    expect(
      firstDocument.evidence.parameters.dissolvedOxygen.missingIntervals
    ).toBeArray();
  });
});

describe("controlled embedding persistence", () => {
  const documents: ApprovedContextDocument[] = [
    {
      analysisId: 11,
      content: "first approved context",
      contextId: "ctx:first",
      document: {},
      documentChecksum: "sha256:first",
      sourceKey: "analysis:11",
    },
    {
      analysisId: 12,
      content: "second approved context",
      contextId: "ctx:second",
      document: {},
      documentChecksum: "sha256:second",
      sourceKey: "analysis:12",
    },
  ];

  test("requires explicit permission before calling a provider", () => {
    const calls: string[] = [];
    const { client, insertedAnalysisIds } = createEmbeddingClient();

    expect(
      embedAndPersistApprovedContexts(
        client,
        documents,
        embeddingProvider(calls),
        false
      )
    ).rejects.toThrow("allowPaidEmbeddings");
    expect(calls).toEqual([]);
    expect(insertedAnalysisIds).toEqual([]);
  });

  test("calls the injected provider sequentially and inserts once per analysis", async () => {
    const calls: string[] = [];
    const { client, insertedAnalysisIds } = createEmbeddingClient();
    const persisted = await embedAndPersistApprovedContexts(
      client,
      documents,
      embeddingProvider(calls),
      true
    );

    expect(calls).toEqual([
      "first approved context",
      "second approved context",
    ]);
    expect(insertedAnalysisIds).toEqual([11, 12]);
    expect(persisted).toHaveLength(2);
    expect(persisted.every(({ dimensions }) => dimensions === 1024)).toBe(true);
  });
});
