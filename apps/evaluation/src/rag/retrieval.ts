import { checksumJson } from "../shared/json.ts";
import { asArray, asRecord, asString } from "../shared/validation.ts";
import type {
  RagContextMapping,
  RagGoldCase,
  RetrievalCandidate,
  RetrievalExecution,
} from "./types.ts";

const readNonnegativeNumber = (value: unknown, path: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${path} must be a nonnegative finite number`);
  }
  return value;
};

const readPositiveInteger = (value: unknown, path: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`${path} must be a positive integer`);
  }
  return value as number;
};

const parseCandidate = (value: unknown, path: string): RetrievalCandidate => {
  const record = asRecord(value, path);
  const analysisId =
    record.analysisId === undefined
      ? undefined
      : readPositiveInteger(record.analysisId, `${path}.analysisId`);
  const contextId =
    record.contextId === undefined
      ? undefined
      : asString(record.contextId, `${path}.contextId`);
  if (analysisId === undefined && contextId === undefined) {
    throw new Error(`${path} needs analysisId or contextId`);
  }
  const { similarity } = record;
  if (
    similarity !== null &&
    similarity !== undefined &&
    (typeof similarity !== "number" || !Number.isFinite(similarity))
  ) {
    throw new Error(`${path}.similarity must be finite or null`);
  }
  return {
    analysisId,
    contextId,
    rank: readPositiveInteger(record.rank, `${path}.rank`),
    similarity: similarity === undefined ? null : similarity,
    sourceKey:
      record.sourceKey === undefined || record.sourceKey === null
        ? null
        : asString(record.sourceKey, `${path}.sourceKey`),
  };
};

const parseExecution = (value: unknown, index: number): RetrievalExecution => {
  const path = `retrieval.executions[${index}]`;
  const record = asRecord(value, path);
  const candidates = asArray(record.candidates, `${path}.candidates`).map(
    (candidate, candidateIndex) =>
      parseCandidate(candidate, `${path}.candidates[${candidateIndex}]`)
  );
  candidates.sort((left, right) => left.rank - right.rank);
  if (new Set(candidates.map(({ rank }) => rank)).size !== candidates.length) {
    throw new Error(`${path}.candidates ranks must be unique`);
  }
  const topK = readPositiveInteger(record.topK, `${path}.topK`);
  if (topK !== 5) {
    throw new Error(`${path}.topK must equal 5`);
  }
  return {
    candidates,
    caseId: asString(record.caseId, `${path}.caseId`),
    pondId: readPositiveInteger(record.pondId, `${path}.pondId`),
    queryEmbeddingMs: readNonnegativeNumber(
      record.queryEmbeddingMs,
      `${path}.queryEmbeddingMs`
    ),
    retrievalMs: readNonnegativeNumber(
      record.retrievalMs,
      `${path}.retrievalMs`
    ),
    topK,
    trial: readPositiveInteger(record.trial, `${path}.trial`),
  };
};

const parseContextMappings = (value: unknown): RagContextMapping[] => {
  const mappings = asArray(value, "retrieval.contextMap").map(
    (entry, index) => {
      const path = `retrieval.contextMap[${index}]`;
      const record = asRecord(entry, path);
      return {
        analysisId: readPositiveInteger(
          record.analysisId,
          `${path}.analysisId`
        ),
        contextId: asString(record.contextId, `${path}.contextId`),
      };
    }
  );
  if (
    new Set(mappings.map(({ contextId }) => contextId)).size !==
      mappings.length ||
    new Set(mappings.map(({ analysisId }) => analysisId)).size !==
      mappings.length
  ) {
    throw new Error("RAG context mapping IDs must be one-to-one and unique");
  }
  return mappings;
};

export interface RetrievalCapture {
  contextMap: RagContextMapping[];
  executions: RetrievalExecution[];
  schemaVersion: 1;
}

export const parseRetrievalCapture = (value: unknown): RetrievalCapture => {
  const record = asRecord(value, "retrieval");
  if (record.schemaVersion !== 1) {
    throw new Error("retrieval.schemaVersion must equal 1");
  }
  return {
    contextMap: parseContextMappings(record.contextMap),
    executions: asArray(record.executions, "retrieval.executions").map(
      parseExecution
    ),
    schemaVersion: 1,
  };
};

export const materializeCandidateContextIds = (
  candidates: readonly RetrievalCandidate[],
  mappings: readonly RagContextMapping[],
  topK = 5
): string[] => {
  const contextByAnalysis = new Map(
    mappings.map(({ analysisId, contextId }) => [analysisId, contextId])
  );
  const contextIds: string[] = [];
  for (const candidate of [...candidates]
    .sort((left, right) => left.rank - right.rank)
    .slice(0, topK)) {
    const contextId =
      candidate.contextId ??
      (candidate.analysisId === undefined
        ? undefined
        : contextByAnalysis.get(candidate.analysisId));
    if (contextId && !contextIds.includes(contextId)) {
      contextIds.push(contextId);
    }
  }
  return contextIds;
};

export const recallAtK = (
  expectedContextIds: readonly string[],
  actualContextIds: readonly string[],
  k = 5
): number | null => {
  if (expectedContextIds.length === 0) {
    return null;
  }
  const actual = new Set(actualContextIds.slice(0, k));
  const foundCount = expectedContextIds.filter((id) => actual.has(id)).length;
  return foundCount / expectedContextIds.length;
};

interface ScoredRetrievalExecution {
  actualContextIds: string[];
  caseId: string;
  expectedContextIds: string[];
  missingContextIds: string[];
  pondScopePassed: boolean;
  recallAt5: number | null;
  trial: number;
  unexpectedContextIds: string[];
}

export interface RetrievalScoreResult {
  answerableExecutionCount: number;
  captureChecksum: string;
  completeThreeTrialsPerCase: boolean;
  executions: ScoredRetrievalExecution[];
  goldChecksum: string;
  meanRecallAt5: number | null;
  passed: boolean;
  schemaVersion: 1;
  targetMeanRecallAt5: 0.9;
}

export const scoreRetrievalCapture = (
  capture: RetrievalCapture,
  goldCases: readonly RagGoldCase[]
): RetrievalScoreResult => {
  const caseById = new Map(
    goldCases.map((goldCase) => [goldCase.id, goldCase])
  );
  const executions = capture.executions.map((execution) => {
    const goldCase = caseById.get(execution.caseId);
    if (!goldCase) {
      throw new Error(
        `Unknown RAG case in retrieval capture: ${execution.caseId}`
      );
    }
    const actualContextIds = materializeCandidateContextIds(
      execution.candidates,
      capture.contextMap,
      5
    );
    const expected = new Set(goldCase.expectedContextIds);
    const actual = new Set(actualContextIds);
    return {
      actualContextIds,
      caseId: execution.caseId,
      expectedContextIds: goldCase.expectedContextIds,
      missingContextIds: goldCase.expectedContextIds.filter(
        (contextId) => !actual.has(contextId)
      ),
      pondScopePassed: execution.pondId === goldCase.pondId,
      recallAt5: goldCase.mustAbstain
        ? null
        : recallAtK(goldCase.expectedContextIds, actualContextIds, 5),
      trial: execution.trial,
      unexpectedContextIds: actualContextIds.filter(
        (contextId) => !expected.has(contextId)
      ),
    };
  });
  const answerableRecalls = executions.flatMap(({ recallAt5 }) =>
    recallAt5 === null ? [] : [recallAt5]
  );
  const meanRecallAt5 =
    answerableRecalls.length === 0
      ? null
      : answerableRecalls.reduce((sum, value) => sum + value, 0) /
        answerableRecalls.length;
  const completeThreeTrialsPerCase = goldCases.every((goldCase) => {
    const trials = executions
      .filter(({ caseId }) => caseId === goldCase.id)
      .map(({ trial }) => trial);
    return (
      trials.length === 3 &&
      new Set(trials).size === 3 &&
      trials.every((trial) => trial >= 1 && trial <= 3)
    );
  });

  return {
    answerableExecutionCount: answerableRecalls.length,
    captureChecksum: checksumJson(capture),
    completeThreeTrialsPerCase,
    executions,
    goldChecksum: checksumJson(goldCases),
    meanRecallAt5,
    passed:
      completeThreeTrialsPerCase &&
      meanRecallAt5 !== null &&
      meanRecallAt5 >= 0.9 &&
      executions.every(({ pondScopePassed }) => pondScopePassed),
    schemaVersion: 1,
    targetMeanRecallAt5: 0.9,
  };
};
