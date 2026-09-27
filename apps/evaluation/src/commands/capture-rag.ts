import { resolve } from "node:path";
import {
  summarizeAnswerEvents,
  validateMonotonicEventOffsets,
} from "../rag/answer-capture.ts";
import {
  parseLiveRetrievalResponse,
  parsePreparedRagContextMap,
  physicalPondIdFor,
  RAG_CAPTURE_TRIALS,
  validateCompleteCaseTrials,
  validateLiveRetrievalExecutions,
  validatePreparedRagContextMap,
} from "../rag/capture-validation.ts";
import { loadRagGoldCases } from "../rag/gold.ts";
import {
  parseRetrievalCapture,
  type RetrievalCapture,
  scoreRetrievalCapture,
} from "../rag/retrieval.ts";
import type { RagGoldCase, RetrievalExecution } from "../rag/types.ts";
import type { ArtifactStore } from "../runtime/artifacts.ts";
import { artifactStore as defaultArtifactStore } from "../runtime/artifacts.ts";
import {
  assertHttpTargetAllowed,
  sanitizeHttpBaseUrl,
} from "../runtime/environment.ts";
import {
  consumeSseStream,
  type TimedSseEvent,
} from "../runtime/http-stream.ts";

const CONTEXT_MAP_PATH = "rag/preparation/context-map.json";
const RETRIEVAL_RAW_PATH = "rag/retrieval/raw-capture.ndjson";
const RETRIEVAL_CAPTURE_PATH = "rag/retrieval/live-capture.json";
const RETRIEVAL_INCOMPLETE_PATH = "rag/retrieval/live-capture-incomplete.json";
const RETRIEVAL_SCORE_PATH = "rag/retrieval/score-live-capture.json";
const ANSWER_RAW_PATH = "rag/answers/raw-capture.ndjson";
const ANSWER_REVIEW_PATH = "rag/answers/answer-review-template.json";
const DEFAULT_REQUEST_TIMEOUT_MS = 180_000;

type FetchImplementation = typeof fetch;

interface CaptureRagBaseOptions {
  allowPaidModels: boolean;
  allowRemoteTarget: boolean;
  analysisApiUrl: string;
  apiKey: string;
  artifactStore?: ArtifactStore;
  fetch?: FetchImplementation;
  requestTimeoutMs?: number;
  runId: string;
}

export type CaptureRagRetrievalOptions = CaptureRagBaseOptions;
export type CaptureRagAnswersOptions = CaptureRagBaseOptions;

interface BufferedHttpResult {
  durationMs: number;
  ok: boolean;
  responseText: string;
  status: number;
}

interface AnswerCaptureRecord {
  caseId: string;
  citations: string[];
  clear: BufferedHttpResult;
  errors: string[];
  events: TimedSseEvent[];
  logicalPondId: number;
  physicalPondId: number;
  question: string;
  responseText: string;
  sources: ReturnType<typeof summarizeAnswerEvents>["sources"];
  status: number | null;
  timings: {
    firstProviderMs: number | null;
    firstStreamMs: number | null;
    firstTextMs: number | null;
    responseHeadersMs: number | null;
    totalMs: number;
  };
  trial: number;
}

export interface CaptureRagAnswersResult {
  executionCount: number;
  failedExecutionCount: number;
  rawArtifactPath: string;
  reviewArtifactPath: string;
}

export interface CaptureRagRetrievalResult {
  capture: RetrievalCapture;
  score: ReturnType<typeof scoreRetrievalCapture>;
}

const assertPaidModelsAllowed = (allowPaidModels: boolean): void => {
  if (!allowPaidModels) {
    throw new Error(
      "Live RAG capture requires explicit allowPaidModels=true authorization"
    );
  }
};

const requireApiKey = (apiKey: string): string => {
  if (!apiKey.trim()) {
    throw new Error("An analysis API key is required for live RAG capture");
  }
  return apiKey;
};

const redactSecret = (value: string, secret: string): string =>
  secret.length === 0 ? value : value.replaceAll(secret, "[REDACTED]");

const redactSecretValue = <Value>(value: Value, secret: string): Value => {
  if (typeof value === "string") {
    return redactSecret(value, secret) as Value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactSecretValue(entry, secret)) as Value;
  }
  if (value !== null && typeof value === "object") {
    const redacted: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      redacted[key] = redactSecretValue(entry, secret);
    }
    return redacted as Value;
  }
  return value;
};

const errorMessage = (error: unknown, apiKey: string): string =>
  redactSecret(error instanceof Error ? error.message : String(error), apiKey);

const requestHeaders = (
  apiKey: string,
  runId: string,
  accept: string
): Record<string, string> => ({
  Accept: accept,
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
  "X-Evaluation-Run-Id": runId,
});

const executeBufferedRequest = async (
  fetchImplementation: FetchImplementation,
  input: {
    apiKey: string;
    body?: unknown;
    method: "DELETE" | "POST";
    runId: string;
    timeoutMs: number;
    url: string;
  }
): Promise<BufferedHttpResult> => {
  const startedAt = performance.now();
  const response = await fetchImplementation(input.url, {
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    headers: requestHeaders(input.apiKey, input.runId, "application/json"),
    method: input.method,
    signal: AbortSignal.timeout(input.timeoutMs),
  });
  const responseText = await response.text();
  return {
    durationMs: performance.now() - startedAt,
    ok: response.ok,
    responseText,
    status: response.status,
  };
};

const parseJsonResponse = (responseText: string, path: string): unknown => {
  try {
    return JSON.parse(responseText) as unknown;
  } catch (error) {
    throw new Error(`${path} must be valid JSON`, { cause: error });
  }
};

const initializeCapture = async (options: CaptureRagBaseOptions) => {
  assertPaidModelsAllowed(options.allowPaidModels);
  const apiKey = requireApiKey(options.apiKey);
  const target = sanitizeHttpBaseUrl(options.analysisApiUrl);
  assertHttpTargetAllowed(target, options.allowRemoteTarget);
  const store = options.artifactStore ?? defaultArtifactStore;
  await store.requireRun(options.runId);
  const [goldCases, contextMapValue] = await Promise.all([
    loadRagGoldCases(),
    store.readJson(options.runId, CONTEXT_MAP_PATH),
  ]);
  const contextMap = parsePreparedRagContextMap(contextMapValue);
  validatePreparedRagContextMap(contextMap, goldCases);
  return { apiKey, contextMap, goldCases, store, target };
};

const retrievalRequest = async (
  fetchImplementation: FetchImplementation,
  input: {
    apiKey: string;
    caseId: string;
    logicalPondId: number;
    physicalPondId: number;
    question: string;
    runId: string;
    timeoutMs: number;
    trial: number;
    url: string;
  }
): Promise<{ execution: RetrievalExecution; raw: Record<string, unknown> }> => {
  const requestBody = { query: input.question };
  const result = await executeBufferedRequest(fetchImplementation, {
    apiKey: input.apiKey,
    body: requestBody,
    method: "POST",
    runId: input.runId,
    timeoutMs: input.timeoutMs,
    url: input.url,
  });
  const raw = {
    caseId: input.caseId,
    durationMs: result.durationMs,
    logicalPondId: input.logicalPondId,
    physicalPondId: input.physicalPondId,
    requestBody,
    responseText: redactSecret(result.responseText, input.apiKey),
    status: result.status,
    trial: input.trial,
  };
  if (!result.ok) {
    throw new RetrievalRequestError(
      `Retrieval request returned HTTP ${result.status}`,
      raw
    );
  }

  try {
    const execution = parseLiveRetrievalResponse(
      parseJsonResponse(result.responseText, "retrieval response"),
      {
        caseId: input.caseId,
        logicalPondId: input.logicalPondId,
        physicalPondId: input.physicalPondId,
        trial: input.trial,
      }
    );
    return { execution, raw };
  } catch (error) {
    throw RetrievalRequestError.from(
      errorMessage(error, input.apiKey),
      raw,
      error
    );
  }
};

class RetrievalRequestError extends Error {
  readonly raw: Record<string, unknown>;

  static from(
    message: string,
    raw: Record<string, unknown>,
    cause: unknown
  ): RetrievalRequestError {
    return new RetrievalRequestError(message, raw, { cause });
  }

  constructor(
    message: string,
    raw: Record<string, unknown>,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "RetrievalRequestError";
    this.raw = raw;
  }
}

export const captureRagRetrieval = async (
  options: CaptureRagRetrievalOptions
): Promise<CaptureRagRetrievalResult> => {
  const initialized = await initializeCapture(options);
  const fetchImplementation = options.fetch ?? fetch;
  const timeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const rawWriter = await initialized.store.openNdjson(
    options.runId,
    RETRIEVAL_RAW_PATH
  );
  const executions: RetrievalExecution[] = [];
  const failures: string[] = [];

  try {
    for (const goldCase of initialized.goldCases) {
      const physicalPondId = physicalPondIdFor(
        initialized.contextMap,
        goldCase.pondId
      );
      for (const trial of RAG_CAPTURE_TRIALS) {
        try {
          // biome-ignore lint/performance/noAwaitInLoops: Paid retrieval trials must be isolated and sequential.
          const result = await retrievalRequest(fetchImplementation, {
            apiKey: initialized.apiKey,
            caseId: goldCase.id,
            logicalPondId: goldCase.pondId,
            physicalPondId,
            question: goldCase.question,
            runId: options.runId,
            timeoutMs,
            trial,
            url: `${initialized.target.baseUrl}/chats/ponds/${physicalPondId}/retrieval`,
          });
          executions.push(result.execution);
          await rawWriter.append({ ...result.raw, error: null });
        } catch (error) {
          const message = errorMessage(error, initialized.apiKey);
          failures.push(`${goldCase.id}:${trial}: ${message}`);
          const raw =
            error instanceof RetrievalRequestError
              ? error.raw
              : {
                  caseId: goldCase.id,
                  logicalPondId: goldCase.pondId,
                  physicalPondId,
                  requestBody: { query: goldCase.question },
                  responseText: null,
                  status: null,
                  trial,
                };
          await rawWriter.append({ ...raw, error: message });
        }
      }
    }
  } finally {
    await rawWriter.close();
  }

  const capture: RetrievalCapture = {
    contextMap: initialized.contextMap.contextMap.map(
      ({ analysisId, contextId }) => ({ analysisId, contextId })
    ),
    executions,
    schemaVersion: 1,
  };
  if (failures.length > 0) {
    await initialized.store.writeJson(
      options.runId,
      RETRIEVAL_INCOMPLETE_PATH,
      { ...capture, captureErrors: failures }
    );
    throw new Error(
      `Live retrieval capture completed with ${failures.length} failed executions; see ${RETRIEVAL_RAW_PATH}`
    );
  }

  validateLiveRetrievalExecutions(executions, initialized.goldCases);
  const parsedCapture = parseRetrievalCapture(capture);
  const score = scoreRetrievalCapture(parsedCapture, initialized.goldCases);
  await initialized.store.writeJson(
    options.runId,
    RETRIEVAL_CAPTURE_PATH,
    parsedCapture
  );
  await initialized.store.writeJson(options.runId, RETRIEVAL_SCORE_PATH, score);
  return { capture: parsedCapture, score };
};

const emptyClearResult = (): BufferedHttpResult => ({
  durationMs: 0,
  ok: false,
  responseText: "",
  status: 0,
});

const answerRequestBody = (goldCase: RagGoldCase, trial: number): unknown => ({
  message: {
    id: `evaluation_${goldCase.id}_${trial}`,
    parts: [{ text: goldCase.question, type: "text" }],
    role: "user",
  },
});

const captureAnswerExecution = async (
  fetchImplementation: FetchImplementation,
  input: {
    apiKey: string;
    goldCase: RagGoldCase;
    physicalPondId: number;
    runId: string;
    timeoutMs: number;
    trial: number;
    url: string;
  }
): Promise<AnswerCaptureRecord> => {
  const clear = await executeBufferedRequest(fetchImplementation, {
    apiKey: input.apiKey,
    method: "DELETE",
    runId: input.runId,
    timeoutMs: input.timeoutMs,
    url: input.url,
  });
  clear.responseText = redactSecret(clear.responseText, input.apiKey);
  if (!clear.ok) {
    return {
      caseId: input.goldCase.id,
      citations: [],
      clear,
      errors: [`Chat clear returned HTTP ${clear.status}`],
      events: [],
      logicalPondId: input.goldCase.pondId,
      physicalPondId: input.physicalPondId,
      question: input.goldCase.question,
      responseText: "",
      sources: [],
      status: null,
      timings: {
        firstProviderMs: null,
        firstStreamMs: null,
        firstTextMs: null,
        responseHeadersMs: null,
        totalMs: clear.durationMs,
      },
      trial: input.trial,
    };
  }

  const startedAt = performance.now();
  const response = await fetchImplementation(input.url, {
    body: JSON.stringify(answerRequestBody(input.goldCase, input.trial)),
    headers: requestHeaders(input.apiKey, input.runId, "text/event-stream"),
    method: "POST",
    signal: AbortSignal.timeout(input.timeoutMs),
  });
  const responseHeadersMs = performance.now() - startedAt;
  if (!response.ok) {
    const responseText = redactSecret(await response.text(), input.apiKey);
    return {
      caseId: input.goldCase.id,
      citations: [],
      clear,
      errors: [
        `Answer request returned HTTP ${response.status}`,
        ...(responseText ? [responseText] : []),
      ],
      events: [],
      logicalPondId: input.goldCase.pondId,
      physicalPondId: input.physicalPondId,
      question: input.goldCase.question,
      responseText: "",
      sources: [],
      status: response.status,
      timings: {
        firstProviderMs: null,
        firstStreamMs: null,
        firstTextMs: null,
        responseHeadersMs,
        totalMs: performance.now() - startedAt,
      },
      trial: input.trial,
    };
  }

  const consumed = await consumeSseStream(response.body, { startedAt });
  const redactedEvents = redactSecretValue(consumed.events, input.apiKey);
  validateMonotonicEventOffsets(redactedEvents);
  const summary = summarizeAnswerEvents(redactedEvents);
  const errors = [...summary.errors];
  if (summary.firstTextMs === null) {
    errors.push("Answer stream did not emit a text-delta event");
  }

  return {
    caseId: input.goldCase.id,
    citations: summary.citations,
    clear,
    errors,
    events: redactedEvents,
    logicalPondId: input.goldCase.pondId,
    physicalPondId: input.physicalPondId,
    question: input.goldCase.question,
    responseText: summary.responseText,
    sources: summary.sources,
    status: response.status,
    timings: {
      firstProviderMs: summary.firstProviderMs,
      firstStreamMs: consumed.firstStreamMs,
      firstTextMs: summary.firstTextMs,
      responseHeadersMs,
      totalMs: consumed.totalMs,
    },
    trial: input.trial,
  };
};

const failedAnswerRecord = (
  goldCase: RagGoldCase,
  physicalPondId: number,
  trial: number,
  error: string
): AnswerCaptureRecord => ({
  caseId: goldCase.id,
  citations: [],
  clear: emptyClearResult(),
  errors: [error],
  events: [],
  logicalPondId: goldCase.pondId,
  physicalPondId,
  question: goldCase.question,
  responseText: "",
  sources: [],
  status: null,
  timings: {
    firstProviderMs: null,
    firstStreamMs: null,
    firstTextMs: null,
    responseHeadersMs: null,
    totalMs: 0,
  },
  trial,
});

const buildAnswerReviewTemplate = (
  records: readonly AnswerCaptureRecord[]
): Record<string, unknown> => ({
  executions: records.map((record) => ({
    caseId: record.caseId,
    citations: record.citations,
    claims: [],
    errors: record.errors,
    explicitAbstention: null,
    observedFacts: {},
    pondId: record.logicalPondId,
    responseText: record.responseText,
    reviewStatus: "UNREVIEWED",
    sources: record.sources,
    timings: record.timings,
    totalMs: record.timings.totalMs,
    trial: record.trial,
    ttftMs: record.timings.firstTextMs,
  })),
  judge: {
    method: "human-review",
    model: null,
    promptChecksum: null,
  },
  reviewInstructions:
    "UNREVIEWED: derive claims, observedFacts, and explicitAbstention only from the captured answer and cited sources; do not copy gold expectations into observations.",
  reviewStatus: "UNREVIEWED",
  schemaVersion: 1,
});

export const captureRagAnswers = async (
  options: CaptureRagAnswersOptions
): Promise<CaptureRagAnswersResult> => {
  const initialized = await initializeCapture(options);
  const fetchImplementation = options.fetch ?? fetch;
  const timeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const rawWriter = await initialized.store.openNdjson(
    options.runId,
    ANSWER_RAW_PATH
  );
  const records: AnswerCaptureRecord[] = [];

  try {
    for (const goldCase of initialized.goldCases) {
      const physicalPondId = physicalPondIdFor(
        initialized.contextMap,
        goldCase.pondId
      );
      for (const trial of RAG_CAPTURE_TRIALS) {
        let record: AnswerCaptureRecord;
        try {
          // biome-ignore lint/performance/noAwaitInLoops: Every paid answer trial requires a completed clear-then-stream cycle.
          record = await captureAnswerExecution(fetchImplementation, {
            apiKey: initialized.apiKey,
            goldCase,
            physicalPondId,
            runId: options.runId,
            timeoutMs,
            trial,
            url: `${initialized.target.baseUrl}/chats/ponds/${physicalPondId}/messages`,
          });
        } catch (error) {
          record = failedAnswerRecord(
            goldCase,
            physicalPondId,
            trial,
            errorMessage(error, initialized.apiKey)
          );
        }
        records.push(record);
        await rawWriter.append(record);
      }
    }
  } finally {
    await rawWriter.close();
  }

  validateCompleteCaseTrials(records, initialized.goldCases, "answer captures");
  const reviewTemplate = buildAnswerReviewTemplate(records);
  const reviewArtifactPath = await initialized.store.writeJson(
    options.runId,
    ANSWER_REVIEW_PATH,
    reviewTemplate
  );
  const failedExecutionCount = records.filter(
    ({ errors }) => errors.length > 0
  ).length;
  if (failedExecutionCount > 0) {
    throw new Error(
      `Live answer capture completed with ${failedExecutionCount} failed executions; raw capture and UNREVIEWED template were preserved`
    );
  }

  return {
    executionCount: records.length,
    failedExecutionCount,
    rawArtifactPath: resolve(
      initialized.store.runPath(options.runId),
      ANSWER_RAW_PATH
    ),
    reviewArtifactPath,
  };
};
