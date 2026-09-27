import type { PondEvaluation } from "../oracle/evaluate.ts";
import { type ArtifactStore, artifactStore } from "../runtime/artifacts.ts";
import {
  readCount,
  type SqlClient,
  withSqlClient,
} from "../runtime/database.ts";
import {
  assertDestructiveDatabaseTarget,
  assertHttpTargetAllowed,
  type SanitizedDatabaseTarget,
  type SanitizedHttpTarget,
  sanitizeHttpBaseUrl,
} from "../runtime/environment.ts";
import {
  boundedResponseText,
  executeHttpRequest,
  type HttpRequestResult,
} from "../runtime/http.ts";
import {
  countAllMeasurements,
  ensurePondsAndCycles,
  insertMeasurementBatch,
  maximumSafeMeasurementBatchSize,
  type PondCycleDefinition,
} from "../runtime/measurements.ts";
import { expectedScenarioRowCount } from "../seed/generator/scenario.ts";
import { canonicalJson, checksumJson, sha256Text } from "../shared/json.ts";
import {
  collectionInstantCount,
  parseUtcTimestamp,
  timestampAtOffsetSeconds,
  timestampByIndex,
  toUtcIsoString,
} from "../shared/time.ts";
import type {
  MeasurementRecord,
  ModelConfig,
  ParameterCode,
  ScenarioSeries,
  ScoringScenarioConfig,
} from "../shared/types.ts";
import { PARAMETER_CODES } from "../shared/types.ts";
import { asRecord } from "../shared/validation.ts";
import {
  type AnalysisComparisonResult,
  compareAnalysisWithOracle,
} from "../validation/analysis-comparison.ts";
import {
  CONTROLLED_EMBEDDING_DIMENSIONS,
  CONTROLLED_MEASUREMENT_COUNT,
  type ControlledContextCatalog,
  type ControlledContextDefinition,
} from "./catalog.ts";
import { evaluateControlledScenario } from "./controlled-oracle.ts";
import {
  assertPaidEmbeddingsAllowed,
  type EmbeddingProvider,
  validateEmbeddingProvider,
} from "./embedding.ts";

const RESET_STATEMENT =
  "TRUNCATE TABLE message_sources, messages, chats, analysis_ai_summaries, analysis_embeddings, analysis_results, measurements, pond_cycles, ponds RESTART IDENTITY CASCADE";
const MILLISECONDS_PER_SECOND = 1000;

export interface ControlledSeedResult {
  batchCount: number;
  effectiveBatchSize: number;
  measurementCount: number;
  perCycleMeasurementCounts: Record<string, number>;
  resetPerformed: true;
}

export interface GuardedControlledSeedResult extends ControlledSeedResult {
  databaseTarget: SanitizedDatabaseTarget;
}

export interface AnalysisRequestOptions {
  apiKey: string;
  runId: string;
  target: SanitizedHttpTarget;
}

export type AnalysisRequester = (
  context: ControlledContextDefinition,
  maximumContinuityGapSeconds: number,
  options: AnalysisRequestOptions
) => Promise<HttpRequestResult>;

export interface VerifiedControlledAnalysis {
  analysisId: number;
  comparison: AnalysisComparisonResult;
  context: ControlledContextDefinition;
  oracle: PondEvaluation;
  response: unknown;
}

export interface ApprovedContextDocument {
  analysisId: number;
  content: string;
  contextId: string;
  document: Record<string, unknown>;
  documentChecksum: string;
  sourceKey: string;
}

export interface PersistedContextEmbedding {
  analysisId: number;
  contextId: string;
  dimensions: number;
  embeddingChecksum: string;
  model: string;
}

export interface PrepareControlledKnowledgeBaseOptions {
  allowPaidEmbeddings: boolean;
  allowRemoteTarget: boolean;
  analysisApiKey: string;
  analysisApiUrl: string;
  confirmReset: boolean;
  databaseUrl: string;
  runId: string;
}

export interface PreparationDependencies {
  embeddingProvider: EmbeddingProvider;
  store?: ArtifactStore;
}

export interface PrepareControlledKnowledgeBaseResult {
  analysisCount: number;
  artifacts: {
    contextMap: string;
    controlledKnowledgeBase: string;
  };
  databaseTarget: SanitizedDatabaseTarget;
  embeddingCount: number;
  endedAt: string;
  measurementCount: number;
  passed: true;
  schemaVersion: 1;
  startedAt: string;
}

const valueAtOffset = (
  series: Extract<ScenarioSeries, { mode: "cadence" }>,
  offsetSeconds: number
): number => {
  const initialValue = series.segments[0]?.value;
  if (initialValue === undefined) {
    throw new Error("Cadence series must contain a segment at offset zero");
  }
  let value = initialValue;
  for (const segment of series.segments) {
    if (segment.startOffsetSeconds > offsetSeconds) {
      break;
    }
    ({ value } = segment);
  }
  return value;
};

function* generateParameterMeasurements(
  scenario: ScoringScenarioConfig,
  model: ModelConfig,
  parameterCode: ParameterCode
): Generator<MeasurementRecord, void, undefined> {
  const series = scenario.series[parameterCode];
  const startEpochMilliseconds = parseUtcTimestamp(
    scenario.start,
    `${scenario.id}.start`
  );
  if (series.mode === "explicit") {
    for (const reading of series.readings) {
      yield {
        cycleId: scenario.cycleId,
        parameterCode,
        pondId: scenario.pondId,
        recordedAt: toUtcIsoString(
          timestampAtOffsetSeconds(
            startEpochMilliseconds,
            reading.offsetSeconds
          )
        ),
        sourceType: scenario.sourceType,
        unit: model.units[parameterCode],
        value: reading.value,
      };
    }
    return;
  }

  const instantCount = collectionInstantCount(
    scenario.start,
    scenario.end,
    scenario.intervalSeconds
  );
  const intervalMilliseconds =
    scenario.intervalSeconds * MILLISECONDS_PER_SECOND;
  let index = 0;
  while (index < instantCount) {
    const offsetSeconds = index * scenario.intervalSeconds;
    yield {
      cycleId: scenario.cycleId,
      parameterCode,
      pondId: scenario.pondId,
      recordedAt: toUtcIsoString(
        timestampByIndex(startEpochMilliseconds, index, intervalMilliseconds)
      ),
      sourceType: scenario.sourceType,
      unit: model.units[parameterCode],
      value: valueAtOffset(series, offsetSeconds),
    };
    index += 1;
  }
}

export function* generateControlledMeasurements(
  context: ControlledContextDefinition,
  model: ModelConfig
): Generator<MeasurementRecord, void, undefined> {
  const { scenario } = context;
  if (scenario.intervalSeconds !== model.collection.intervalSeconds) {
    throw new Error(
      `${context.contextId} collection interval does not match the model`
    );
  }
  for (const parameterCode of PARAMETER_CODES) {
    yield* generateParameterMeasurements(scenario, model, parameterCode);
  }
}

const cycleDefinitions = (
  catalog: ControlledContextCatalog
): PondCycleDefinition[] =>
  catalog.contexts.map(({ scenario }) => ({
    cycleId: scenario.cycleId,
    endDate: scenario.end.slice(0, 10),
    pondId: scenario.pondId,
    startDate: scenario.start.slice(0, 10),
  }));

const readPerCycleCounts = async (
  client: SqlClient
): Promise<Record<string, number>> => {
  const rows = await client.query<{
    cycle_id: unknown;
    row_count: unknown;
  }>(
    "SELECT cycle_id, COUNT(*) AS row_count FROM measurements GROUP BY cycle_id ORDER BY cycle_id"
  );
  return Object.fromEntries(
    rows.map((row, index) => {
      const cycleId = Number(row.cycle_id);
      if (!Number.isSafeInteger(cycleId) || cycleId <= 0) {
        throw new Error(`measurementsByCycle[${index}].cycleId is invalid`);
      }
      return [
        String(cycleId),
        readCount(row.row_count, `measurementsByCycle.${cycleId}.rowCount`),
      ];
    })
  );
};

const seedControlledCatalog = async (
  client: SqlClient,
  catalog: ControlledContextCatalog,
  model: ModelConfig
): Promise<ControlledSeedResult> => {
  const effectiveBatchSize = Math.min(
    catalog.batchSize,
    maximumSafeMeasurementBatchSize()
  );
  const batch: MeasurementRecord[] = [];
  let batchCount = 0;
  let measurementCount = 0;

  await client.query(RESET_STATEMENT);
  await ensurePondsAndCycles(client, cycleDefinitions(catalog));
  for (const context of catalog.contexts) {
    for (const measurement of generateControlledMeasurements(context, model)) {
      batch.push(measurement);
      measurementCount += 1;
      if (batch.length >= effectiveBatchSize) {
        // biome-ignore lint/performance/noAwaitInLoops: Sequential bounded batches protect the evaluation database from unbounded memory and write pressure.
        await insertMeasurementBatch(
          client,
          batch,
          `evaluation:${catalog.catalogId}`
        );
        batch.length = 0;
        batchCount += 1;
      }
    }
  }
  if (batch.length > 0) {
    await insertMeasurementBatch(
      client,
      batch,
      `evaluation:${catalog.catalogId}`
    );
    batchCount += 1;
  }

  const [persistedMeasurementCount, perCycleMeasurementCounts] =
    await Promise.all([
      countAllMeasurements(client),
      readPerCycleCounts(client),
    ]);
  if (
    measurementCount !== CONTROLLED_MEASUREMENT_COUNT ||
    persistedMeasurementCount !== CONTROLLED_MEASUREMENT_COUNT
  ) {
    throw new Error(
      `Controlled seed must contain exactly ${CONTROLLED_MEASUREMENT_COUNT} measurements; generated ${measurementCount}, persisted ${persistedMeasurementCount}`
    );
  }
  for (const { scenario } of catalog.contexts) {
    const expectedCount = expectedScenarioRowCount(scenario);
    if (perCycleMeasurementCounts[String(scenario.cycleId)] !== expectedCount) {
      throw new Error(
        `Cycle ${scenario.cycleId} measurement count does not match its frozen context`
      );
    }
  }

  return {
    batchCount,
    effectiveBatchSize,
    measurementCount,
    perCycleMeasurementCounts,
    resetPerformed: true,
  };
};

export const resetAndSeedControlledCatalog = async (
  catalog: ControlledContextCatalog,
  model: ModelConfig,
  options: { confirmReset: boolean; databaseUrl: string }
): Promise<GuardedControlledSeedResult> => {
  const databaseTarget = assertDestructiveDatabaseTarget(options.databaseUrl, {
    confirmed: options.confirmReset,
  });
  const result = await withSqlClient(
    options.databaseUrl,
    async (client) => await seedControlledCatalog(client, catalog, model)
  );
  return { ...result, databaseTarget };
};

export const requestControlledAnalysis: AnalysisRequester = async (
  context,
  maximumContinuityGapSeconds,
  options
): Promise<HttpRequestResult> =>
  await executeHttpRequest({
    apiKey: options.apiKey,
    body: {
      generateAiSummary: false,
      generateEmbedding: false,
      maximumContinuityGapSeconds,
    },
    method: "POST",
    runId: options.runId,
    url: `${options.target.baseUrl}/analyses/cycles/${context.scenario.cycleId}`,
  });

const readPositiveId = (value: unknown, path: string): number => {
  const id = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error(`${path} must be a positive integer`);
  }
  return id;
};

const findPersistedAnalysis = async (
  client: SqlClient,
  context: ControlledContextDefinition
): Promise<number[]> => {
  const { scenario } = context;
  const rows = await client.query<{ id: unknown }>(
    "SELECT id FROM analysis_results WHERE pond_id = $1 AND cycle_id = $2 AND start_time = $3 AND end_time = $4 ORDER BY id",
    [scenario.pondId, scenario.cycleId, scenario.start, scenario.end]
  );
  return rows.map((row, index) =>
    readPositiveId(row.id, `${context.contextId}.analysisIds[${index}]`)
  );
};

const assertAnalysisHasNoExternalArtifacts = async (
  client: SqlClient,
  contextId: string,
  analysisId: number
): Promise<void> => {
  const [embeddingRows, summaryRows] = await Promise.all([
    client.query<{ row_count: unknown }>(
      "SELECT COUNT(*) AS row_count FROM analysis_embeddings WHERE analysis_id = $1",
      [analysisId]
    ),
    client.query<{ row_count: unknown }>(
      "SELECT COUNT(*) AS row_count FROM analysis_ai_summaries WHERE analysis_id = $1",
      [analysisId]
    ),
  ]);
  const embeddingCount = readCount(
    embeddingRows[0]?.row_count,
    `${contextId}.embeddingCount`
  );
  const summaryCount = readCount(
    summaryRows[0]?.row_count,
    `${contextId}.summaryCount`
  );
  if (embeddingCount !== 0 || summaryCount !== 0) {
    throw new Error(
      `${contextId} deterministic analysis unexpectedly persisted external artifacts`
    );
  }
};

const analyzeControlledContext = async (
  client: SqlClient,
  context: ControlledContextDefinition,
  model: ModelConfig,
  options: AnalysisRequestOptions,
  requester: AnalysisRequester
): Promise<VerifiedControlledAnalysis> => {
  const existingIds = await findPersistedAnalysis(client, context);
  if (existingIds.length !== 0) {
    throw new Error(
      `${context.contextId} must not have a persisted analysis before preparation`
    );
  }
  const maximumContinuityGapSeconds =
    context.scenario.maximumContinuityGapSeconds ??
    model.temporal.defaultMaximumContinuityGapSeconds;
  const response = await requester(
    context,
    maximumContinuityGapSeconds,
    options
  );
  if (response.status !== 200) {
    throw new Error(
      `${context.contextId} analysis failed with HTTP ${response.status}: ${boundedResponseText(response.responseText)}`
    );
  }

  const oracle = evaluateControlledScenario(context.scenario, model);
  const comparison = compareAnalysisWithOracle(
    response.responseBody,
    oracle,
    model,
    { expectedPondId: context.scenario.pondId }
  );
  if (!comparison.passed) {
    throw new Error(
      `${context.contextId} analysis response failed independent oracle verification`
    );
  }
  const persistedIds = await findPersistedAnalysis(client, context);
  if (persistedIds.length !== 1) {
    throw new Error(
      `${context.contextId} must identify exactly one persisted analysis; found ${persistedIds.length}`
    );
  }
  const [analysisId] = persistedIds;
  if (analysisId === undefined) {
    throw new Error(`${context.contextId} persisted analysis disappeared`);
  }
  await assertAnalysisHasNoExternalArtifacts(
    client,
    context.contextId,
    analysisId
  );
  return {
    analysisId,
    comparison,
    context,
    oracle,
    response: response.responseBody,
  };
};

export const analyzeControlledContexts = async (
  client: SqlClient,
  catalog: ControlledContextCatalog,
  model: ModelConfig,
  options: AnalysisRequestOptions,
  requester: AnalysisRequester = requestControlledAnalysis
): Promise<VerifiedControlledAnalysis[]> => {
  const results: VerifiedControlledAnalysis[] = [];
  const analyzeAtIndex = async (index: number): Promise<void> => {
    const context = catalog.contexts[index];
    if (!context) {
      return;
    }
    results.push(
      await analyzeControlledContext(client, context, model, options, requester)
    );
    await analyzeAtIndex(index + 1);
  };
  await analyzeAtIndex(0);
  return results;
};

const recordProperty = (
  record: Record<string, unknown>,
  property: string,
  path: string
): Record<string, unknown> => asRecord(record[property], `${path}.${property}`);

const unfavorableIntervalsFromStats = (
  parameterStats: Record<string, unknown>
): Record<string, unknown> => {
  const intervals: Record<string, unknown> = {};
  for (const parameterCode of PARAMETER_CODES) {
    const stats = recordProperty(
      parameterStats,
      parameterCode,
      "metadata.parameterStats"
    );
    const temporalMetrics = recordProperty(
      stats,
      "temporalMetrics",
      `metadata.parameterStats.${parameterCode}`
    );
    const parameterIntervals = temporalMetrics.unfavorableIntervals;
    if (!Array.isArray(parameterIntervals)) {
      throw new Error(
        `metadata.parameterStats.${parameterCode}.temporalMetrics.unfavorableIntervals must be an array`
      );
    }
    intervals[parameterCode] = parameterIntervals;
  }
  return intervals;
};

const buildOracleEvidence = (
  oracle: PondEvaluation
): Record<string, unknown> => ({
  coverageDecision: oracle.hasSufficientCoverage
    ? "sufficient"
    : "insufficient",
  finalScore: oracle.finalScore,
  overallCoveragePercentage: oracle.overallCoverage * 100,
  parameters: Object.fromEntries(
    PARAMETER_CODES.map((parameterCode) => {
      const result = oracle.parameterResults[parameterCode];
      return [
        parameterCode,
        {
          coverageDecision: result.hasSufficientCoverage
            ? "sufficient"
            : "insufficient",
          coveragePercentage: result.coverage * 100,
          missingIntervals: result.missingIntervals,
          pLow: result.pLow,
          rawReadings: result.rawReadings,
          temporalScore: result.temporalScore,
          unfavorableDurationSeconds: result.unfavorableDurationSeconds,
          unfavorableIntervals: result.representedIntervals
            .filter(({ unfavorable }) => unfavorable)
            .map(({ durationSeconds, end, start, value }) => ({
              durationSeconds,
              end,
              rawValue: value,
              start,
            })),
          weightedMeanScore: result.durationWeightedMean,
        },
      ];
    })
  ),
});

const buildRetrievalSummary = (
  context: ControlledContextDefinition
): string => {
  const { periodLabel, scenario } = context;

  return [
    `Pond analysis context ${scenario.id} (${periodLabel}).`,
    `Reference period: ${scenario.start} through ${scenario.end}.`,
    "This context contains the final pond score, parameter scores, measurement statistics, data coverage, and unfavorable intervals for temperature, pH, salinity, and dissolved oxygen.",
  ].join(" ");
};

export const buildApprovedContextDocuments = (
  analyses: readonly VerifiedControlledAnalysis[],
  catalog: ControlledContextCatalog,
  model: ModelConfig
): ApprovedContextDocument[] =>
  analyses.map((analysis) => {
    const response = asRecord(
      analysis.response,
      `${analysis.context.contextId}.response`
    );
    const metadata = recordProperty(response, "metadata", "response");
    const executionStats = recordProperty(
      metadata,
      "executionStats",
      "response.metadata"
    );
    const parameterStats = recordProperty(
      metadata,
      "parameterStats",
      "response.metadata"
    );
    const sourceKey = `analysis:${analysis.analysisId}`;
    const document: Record<string, unknown> = {
      analysis: {
        coverage: executionStats.dataCoverage,
        finalScore: response.finalScore,
        measurementCounts: executionStats.measurementsByParameter,
        parameterScores: response.parameterScores,
        statistics: parameterStats,
        timeRange: executionStats.timeRange,
        totalMeasurements: executionStats.totalMeasurements,
        unfavorableIntervals: unfavorableIntervalsFromStats(parameterStats),
      },
      approval: {
        catalogChecksum: catalog.catalogChecksum,
        oracleVerified: analysis.comparison.passed,
        oracleVersion: "independent-oracle-v1",
        scenarioConfigChecksum: checksumJson(analysis.context.scenario),
        scoreErrorSummary: analysis.comparison.scoreErrorSummary,
      },
      configuration: {
        effectiveMaximumContinuityGapSeconds:
          analysis.oracle.maximumContinuityGapSeconds,
        model,
        observedAnalysisConfiguration: {
          criticalThreshold: metadata.criticalThreshold,
          maximumContinuityGapSeconds: metadata.maximumContinuityGapSeconds,
          minimumCoveragePercentage: metadata.minimumCoveragePercentage,
          parameterWeights: metadata.parameterWeights,
          scoringModelVersion: metadata.scoringModelVersion,
          windowConvention: metadata.windowConvention,
        },
        scenario: analysis.context.scenario,
      },
      evidence: buildOracleEvidence(analysis.oracle),
      identity: {
        analysisId: analysis.analysisId,
        contextId: analysis.context.contextId,
        cycleId: analysis.context.scenario.cycleId,
        logicalPondId: catalog.logicalPondId,
        periodLabel: analysis.context.periodLabel,
        pondId: analysis.context.scenario.pondId,
        scenarioId: analysis.context.scenario.id,
        sourceKey,
      },
      period: {
        convention: "[start,end)",
        end: analysis.context.scenario.end,
        start: analysis.context.scenario.start,
      },
      schemaVersion: 1,
    };
    const content = `${buildRetrievalSummary(analysis.context)}\n\n${canonicalJson(document)}`;
    return {
      analysisId: analysis.analysisId,
      content,
      contextId: analysis.context.contextId,
      document,
      documentChecksum: sha256Text(content),
      sourceKey,
    };
  });

const vectorLiteral = (embedding: readonly number[]): string =>
  `[${embedding.join(",")}]`;

const embedAndPersistApprovedContext = async (
  client: SqlClient,
  document: ApprovedContextDocument,
  provider: EmbeddingProvider
): Promise<PersistedContextEmbedding> => {
  const existingRows = await client.query<{ row_count: unknown }>(
    "SELECT COUNT(*) AS row_count FROM analysis_embeddings WHERE analysis_id = $1",
    [document.analysisId]
  );
  if (
    readCount(
      existingRows[0]?.row_count,
      `${document.contextId}.embeddingCountBefore`
    ) !== 0
  ) {
    throw new Error(
      `${document.contextId} already has an embedding; refusing to replace controlled knowledge`
    );
  }

  const embedding = await provider.embed(document.content);
  if (embedding.length !== CONTROLLED_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `${document.contextId} embedding has ${embedding.length} dimensions; expected ${CONTROLLED_EMBEDDING_DIMENSIONS}`
    );
  }
  for (const [index, value] of embedding.entries()) {
    if (!Number.isFinite(value)) {
      throw new Error(
        `${document.contextId} embedding value ${index} must be finite`
      );
    }
  }
  await client.query(
    "INSERT INTO analysis_embeddings (analysis_id, content, embedding) VALUES ($1, $2, $3::vector)",
    [document.analysisId, document.content, vectorLiteral(embedding)]
  );
  const persistedRows = await client.query<{ row_count: unknown }>(
    "SELECT COUNT(*) AS row_count FROM analysis_embeddings WHERE analysis_id = $1",
    [document.analysisId]
  );
  if (
    readCount(
      persistedRows[0]?.row_count,
      `${document.contextId}.embeddingCountAfter`
    ) !== 1
  ) {
    throw new Error(
      `${document.contextId} must have exactly one persisted embedding`
    );
  }
  return {
    analysisId: document.analysisId,
    contextId: document.contextId,
    dimensions: provider.dimensions,
    embeddingChecksum: checksumJson(embedding),
    model: provider.model,
  };
};

export const embedAndPersistApprovedContexts = async (
  client: SqlClient,
  documents: readonly ApprovedContextDocument[],
  provider: EmbeddingProvider,
  allowPaidEmbeddings: boolean
): Promise<PersistedContextEmbedding[]> => {
  assertPaidEmbeddingsAllowed(allowPaidEmbeddings);
  validateEmbeddingProvider(provider);
  const persisted: PersistedContextEmbedding[] = [];
  const persistAtIndex = async (index: number): Promise<void> => {
    const document = documents[index];
    if (!document) {
      return;
    }
    persisted.push(
      await embedAndPersistApprovedContext(client, document, provider)
    );
    await persistAtIndex(index + 1);
  };
  await persistAtIndex(0);
  return persisted;
};

export const writeControlledKnowledgeBaseArtifacts = async (
  store: ArtifactStore,
  runId: string,
  catalog: ControlledContextCatalog,
  documents: readonly ApprovedContextDocument[],
  embeddings: readonly PersistedContextEmbedding[]
): Promise<PrepareControlledKnowledgeBaseResult["artifacts"]> => {
  const embeddingByContextId = new Map(
    embeddings.map((embedding) => [embedding.contextId, embedding])
  );
  const controlledKnowledgeBase = {
    catalogChecksum: catalog.catalogChecksum,
    catalogId: catalog.catalogId,
    contexts: documents.map((document) => {
      const embedding = embeddingByContextId.get(document.contextId);
      if (!embedding) {
        throw new Error(
          `${document.contextId} has no persisted embedding record`
        );
      }
      return {
        analysisId: document.analysisId,
        content: document.content,
        contextId: document.contextId,
        documentChecksum: document.documentChecksum,
        embedding,
        sourceKey: document.sourceKey,
      };
    }),
    schemaVersion: 1,
  };
  const contextMap = {
    catalogChecksum: catalog.catalogChecksum,
    catalogId: catalog.catalogId,
    contexts: Object.fromEntries(
      documents.map((document) => {
        const context = catalog.contexts.find(
          ({ contextId }) => contextId === document.contextId
        );
        if (!context) {
          throw new Error(`Catalog context disappeared: ${document.contextId}`);
        }
        return [
          document.contextId,
          {
            analysisId: document.analysisId,
            cycleId: context.scenario.cycleId,
            end: context.scenario.end,
            pondId: context.scenario.pondId,
            scenarioId: context.scenario.id,
            sourceKey: document.sourceKey,
            start: context.scenario.start,
          },
        ];
      })
    ),
    pondMap: {
      [String(catalog.logicalPondId)]: catalog.logicalPondId,
    },
    schemaVersion: 1,
  };
  const controlledKnowledgeBasePath = await store.writeJson(
    runId,
    "rag/preparation/controlled-kb.json",
    controlledKnowledgeBase
  );
  const contextMapPath = await store.writeJson(
    runId,
    "rag/preparation/context-map.json",
    contextMap
  );
  return {
    contextMap: contextMapPath,
    controlledKnowledgeBase: controlledKnowledgeBasePath,
  };
};

export const prepareControlledKnowledgeBase = async (
  catalog: ControlledContextCatalog,
  model: ModelConfig,
  options: PrepareControlledKnowledgeBaseOptions,
  dependencies: PreparationDependencies
): Promise<PrepareControlledKnowledgeBaseResult> => {
  const startedAt = new Date().toISOString();
  const store = dependencies.store ?? artifactStore;
  await store.requireRun(options.runId);
  assertPaidEmbeddingsAllowed(options.allowPaidEmbeddings);
  validateEmbeddingProvider(dependencies.embeddingProvider);
  const target = sanitizeHttpBaseUrl(options.analysisApiUrl);
  assertHttpTargetAllowed(target, options.allowRemoteTarget);

  const seed = await resetAndSeedControlledCatalog(catalog, model, {
    confirmReset: options.confirmReset,
    databaseUrl: options.databaseUrl,
  });
  const prepared = await withSqlClient(options.databaseUrl, async (client) => {
    const analyses = await analyzeControlledContexts(client, catalog, model, {
      apiKey: options.analysisApiKey,
      runId: options.runId,
      target,
    });
    const documents = buildApprovedContextDocuments(analyses, catalog, model);
    const embeddings = await embedAndPersistApprovedContexts(
      client,
      documents,
      dependencies.embeddingProvider,
      options.allowPaidEmbeddings
    );
    return { analyses, documents, embeddings };
  });
  const artifacts = await writeControlledKnowledgeBaseArtifacts(
    store,
    options.runId,
    catalog,
    prepared.documents,
    prepared.embeddings
  );
  const endedAt = new Date().toISOString();
  await store.updateManifest(options.runId, (manifest) => ({
    ...manifest,
    events: [
      ...(Array.isArray(manifest.events) ? manifest.events : []),
      {
        analysisCount: prepared.analyses.length,
        at: endedAt,
        catalogChecksum: catalog.catalogChecksum,
        destructiveReset: true,
        embeddingCount: prepared.embeddings.length,
        measurementCount: seed.measurementCount,
        passed: true,
        stage: "prepare-rag",
      },
    ],
  }));

  return {
    analysisCount: prepared.analyses.length,
    artifacts,
    databaseTarget: seed.databaseTarget,
    embeddingCount: prepared.embeddings.length,
    endedAt,
    measurementCount: seed.measurementCount,
    passed: true,
    schemaVersion: 1,
    startedAt,
  };
};
