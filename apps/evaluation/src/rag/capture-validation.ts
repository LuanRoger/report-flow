import { asArray, asRecord, asString } from "../shared/validation.ts";
import type {
  RagContextMapping,
  RagGoldCase,
  RetrievalCandidate,
  RetrievalExecution,
} from "./types.ts";

export const RAG_CAPTURE_TOP_K = 5 as const;
export const RAG_CAPTURE_TRIALS = [1, 2, 3] as const;

export interface PreparedContextMapping extends RagContextMapping {
  sourceKey: string | null;
}

export interface PreparedPondMapping {
  logicalPondId: number;
  pondId: number;
}

export interface PreparedRagContextMap {
  contextMap: PreparedContextMapping[];
  pondMap: PreparedPondMapping[];
  schemaVersion: 1;
  topK: 5;
}

const readPositiveInteger = (value: unknown, path: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`${path} must be a positive integer`);
  }
  return value as number;
};

const readNonnegativeNumber = (value: unknown, path: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${path} must be a nonnegative finite number`);
  }
  return value;
};

const parseContextMapArray = (value: unknown): PreparedContextMapping[] =>
  asArray(value, "contextMap.contextMap").map((entry, index) => {
    const path = `contextMap.contextMap[${index}]`;
    const record = asRecord(entry, path);
    return {
      analysisId: readPositiveInteger(record.analysisId, `${path}.analysisId`),
      contextId: asString(record.contextId, `${path}.contextId`),
      sourceKey:
        record.sourceKey === undefined || record.sourceKey === null
          ? null
          : asString(record.sourceKey, `${path}.sourceKey`),
    };
  });

const parseContextMapRecord = (value: unknown): PreparedContextMapping[] =>
  Object.entries(asRecord(value, "contextMap.contexts")).map(
    ([contextId, entry]) => {
      const path = `contextMap.contexts.${contextId}`;
      const record = asRecord(entry, path);
      return {
        analysisId: readPositiveInteger(
          record.analysisId,
          `${path}.analysisId`
        ),
        contextId: asString(contextId, `${path}.contextId`),
        sourceKey:
          record.sourceKey === undefined || record.sourceKey === null
            ? null
            : asString(record.sourceKey, `${path}.sourceKey`),
      };
    }
  );

const parseContextMap = (value: unknown): PreparedContextMapping[] => {
  const mappings = Array.isArray(value)
    ? parseContextMapArray(value)
    : parseContextMapRecord(value);

  const contextIds = mappings.map(({ contextId }) => contextId);
  const analysisIds = mappings.map(({ analysisId }) => analysisId);
  const sourceKeys = mappings.flatMap(({ sourceKey }) =>
    sourceKey === null ? [] : [sourceKey]
  );
  if (
    new Set(contextIds).size !== contextIds.length ||
    new Set(analysisIds).size !== analysisIds.length ||
    new Set(sourceKeys).size !== sourceKeys.length
  ) {
    throw new Error(
      "Prepared RAG context IDs, analysis IDs, and source keys must be one-to-one"
    );
  }
  return mappings;
};

const parsePondMapArray = (value: unknown): PreparedPondMapping[] =>
  asArray(value, "contextMap.pondMap").map((entry, index) => {
    const path = `contextMap.pondMap[${index}]`;
    const record = asRecord(entry, path);
    return {
      logicalPondId: readPositiveInteger(
        record.logicalPondId,
        `${path}.logicalPondId`
      ),
      pondId: readPositiveInteger(
        record.pondId ?? record.actualPondId,
        `${path}.pondId`
      ),
    };
  });

const parsePondMapRecord = (value: unknown): PreparedPondMapping[] => {
  const record = asRecord(value, "contextMap.pondMap");
  return Object.entries(record).map(([logicalPondId, pondId]) => ({
    logicalPondId: readPositiveInteger(
      Number(logicalPondId),
      `contextMap.pondMap.${logicalPondId}`
    ),
    pondId: readPositiveInteger(pondId, `contextMap.pondMap.${logicalPondId}`),
  }));
};

const parsePondMap = (value: unknown): PreparedPondMapping[] => {
  const mappings = Array.isArray(value)
    ? parsePondMapArray(value)
    : parsePondMapRecord(value);
  const logicalIds = mappings.map(({ logicalPondId }) => logicalPondId);
  const physicalIds = mappings.map(({ pondId }) => pondId);
  if (
    new Set(logicalIds).size !== logicalIds.length ||
    new Set(physicalIds).size !== physicalIds.length
  ) {
    throw new Error("Prepared RAG pond mapping must be one-to-one");
  }
  return mappings;
};

export const parsePreparedRagContextMap = (
  value: unknown
): PreparedRagContextMap => {
  const record = asRecord(value, "contextMap");
  if (record.schemaVersion !== 1) {
    throw new Error("contextMap.schemaVersion must equal 1");
  }
  if (record.topK !== undefined && record.topK !== RAG_CAPTURE_TOP_K) {
    throw new Error(`contextMap.topK must equal ${RAG_CAPTURE_TOP_K}`);
  }

  const contextMapValue = record.contextMap ?? record.contexts;
  if (contextMapValue === undefined) {
    throw new Error("contextMap.contextMap is required");
  }
  const pondMapValue = record.pondMap ?? record.pondIdMap;
  if (pondMapValue === undefined) {
    throw new Error("contextMap.pondMap is required");
  }

  return {
    contextMap: parseContextMap(contextMapValue),
    pondMap: parsePondMap(pondMapValue),
    schemaVersion: 1,
    topK: RAG_CAPTURE_TOP_K,
  };
};

export const validatePreparedRagContextMap = (
  contextMap: PreparedRagContextMap,
  goldCases: readonly RagGoldCase[]
): void => {
  const mappedContexts = new Set(
    contextMap.contextMap.map(({ contextId }) => contextId)
  );
  const missingContexts = [
    ...new Set(
      goldCases.flatMap(({ expectedContextIds }) => expectedContextIds)
    ),
  ].filter((contextId) => !mappedContexts.has(contextId));
  if (missingContexts.length > 0) {
    throw new Error(
      `Prepared RAG context map is missing gold contexts: ${missingContexts.join(", ")}`
    );
  }

  const mappedPonds = new Set(
    contextMap.pondMap.map(({ logicalPondId }) => logicalPondId)
  );
  const missingPonds = [
    ...new Set(goldCases.map(({ pondId }) => pondId)),
  ].filter((pondId) => !mappedPonds.has(pondId));
  if (missingPonds.length > 0) {
    throw new Error(
      `Prepared RAG context map is missing logical ponds: ${missingPonds.join(", ")}`
    );
  }
};

export const physicalPondIdFor = (
  contextMap: PreparedRagContextMap,
  logicalPondId: number
): number => {
  const mapping = contextMap.pondMap.find(
    (entry) => entry.logicalPondId === logicalPondId
  );
  if (!mapping) {
    throw new Error(
      `No prepared pond mapping for logical pond ${logicalPondId}`
    );
  }
  return mapping.pondId;
};

const parseRetrievalCandidate = (
  value: unknown,
  index: number
): RetrievalCandidate => {
  const path = `retrievalResponse.candidates[${index}]`;
  const record = asRecord(value, path);
  const analysisRecord =
    record.analysis === undefined
      ? undefined
      : asRecord(record.analysis, `${path}.analysis`);
  const analysisIdValue = record.analysisId ?? analysisRecord?.analysisId;
  const contextIdValue = record.contextId;
  if (analysisIdValue === undefined && contextIdValue === undefined) {
    throw new Error(`${path} needs analysisId or contextId`);
  }

  const similarity = record.similarity ?? null;
  if (
    similarity !== null &&
    (typeof similarity !== "number" || !Number.isFinite(similarity))
  ) {
    throw new Error(`${path}.similarity must be finite or null`);
  }

  return {
    analysisId:
      analysisIdValue === undefined
        ? undefined
        : readPositiveInteger(analysisIdValue, `${path}.analysisId`),
    contextId:
      contextIdValue === undefined
        ? undefined
        : asString(contextIdValue, `${path}.contextId`),
    rank: readPositiveInteger(record.rank, `${path}.rank`),
    similarity,
    sourceKey:
      record.sourceKey === undefined || record.sourceKey === null
        ? null
        : asString(record.sourceKey, `${path}.sourceKey`),
  };
};

const readTiming = (
  record: Record<string, unknown>,
  timings: Record<string, unknown>,
  key: "queryEmbeddingMs" | "retrievalMs"
): number =>
  readNonnegativeNumber(
    record[key] ?? timings[key],
    `retrievalResponse.${key}`
  );

export const parseLiveRetrievalResponse = (
  value: unknown,
  identity: {
    caseId: string;
    logicalPondId: number;
    physicalPondId: number;
    trial: number;
  }
): RetrievalExecution => {
  const record = asRecord(value, "retrievalResponse");
  const timings =
    record.timings === undefined
      ? {}
      : asRecord(record.timings, "retrievalResponse.timings");
  const topK = readPositiveInteger(record.topK, "retrievalResponse.topK");
  if (topK !== RAG_CAPTURE_TOP_K) {
    throw new Error(`retrievalResponse.topK must equal ${RAG_CAPTURE_TOP_K}`);
  }
  const filters =
    record.filters === undefined
      ? undefined
      : asRecord(record.filters, "retrievalResponse.filters");
  const responsePondId = record.pondId ?? filters?.pondId;
  if (
    responsePondId === undefined ||
    readPositiveInteger(responsePondId, "retrievalResponse.filters.pondId") !==
      identity.physicalPondId
  ) {
    throw new Error(
      "retrievalResponse pond filter does not match the requested pond"
    );
  }

  const candidates = asArray(
    record.candidates ?? record.sources,
    "retrievalResponse.candidates"
  ).map(parseRetrievalCandidate);
  if (candidates.length > RAG_CAPTURE_TOP_K) {
    throw new Error(
      `retrievalResponse.candidates must contain at most ${RAG_CAPTURE_TOP_K} entries`
    );
  }
  const ranks = candidates.map(({ rank }) => rank);
  if (new Set(ranks).size !== ranks.length) {
    throw new Error("retrievalResponse candidate ranks must be unique");
  }
  candidates.sort((left, right) => left.rank - right.rank);

  return {
    candidates,
    caseId: identity.caseId,
    pondId: identity.logicalPondId,
    queryEmbeddingMs: readTiming(record, timings, "queryEmbeddingMs"),
    retrievalMs: readTiming(record, timings, "retrievalMs"),
    topK: RAG_CAPTURE_TOP_K,
    trial: identity.trial,
  };
};

interface CaseTrialIdentity {
  caseId: string;
  trial: number;
}

export const validateCompleteCaseTrials = (
  executions: readonly CaseTrialIdentity[],
  goldCases: readonly RagGoldCase[],
  path: string
): void => {
  const expected = new Set(
    goldCases.flatMap(({ id }) =>
      RAG_CAPTURE_TRIALS.map((trial) => `${id}:${trial}`)
    )
  );
  const actual = executions.map(({ caseId, trial }) => `${caseId}:${trial}`);
  const actualSet = new Set(actual);
  if (actualSet.size !== actual.length) {
    throw new Error(`${path} contains duplicate case/trial executions`);
  }
  const missing = [...expected].filter((identity) => !actualSet.has(identity));
  const unexpected = [...actualSet].filter(
    (identity) => !expected.has(identity)
  );
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `${path} must contain exactly three trials for every gold case; missing=${missing.length}, unexpected=${unexpected.length}`
    );
  }
};

export const validateLiveRetrievalExecutions = (
  executions: readonly RetrievalExecution[],
  goldCases: readonly RagGoldCase[]
): void => {
  validateCompleteCaseTrials(executions, goldCases, "retrieval executions");
  const goldById = new Map(
    goldCases.map((goldCase) => [goldCase.id, goldCase])
  );
  for (const execution of executions) {
    if (execution.topK !== RAG_CAPTURE_TOP_K) {
      throw new Error(
        `Retrieval execution ${execution.caseId} must use topK=5`
      );
    }
    if (goldById.get(execution.caseId)?.pondId !== execution.pondId) {
      throw new Error(
        `Retrieval execution ${execution.caseId} has the wrong logical pond`
      );
    }
  }
};
