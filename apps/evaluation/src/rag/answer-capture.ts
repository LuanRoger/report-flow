import type { TimedSseEvent } from "../runtime/http-stream.ts";
import { asRecord } from "../shared/validation.ts";

export interface CapturedAnswerSource {
  mediaType: string | null;
  sourceId: string;
  title: string | null;
  url: string | null;
}

export interface AnswerStreamSummary {
  citations: string[];
  errors: string[];
  firstProviderMs: number | null;
  firstTextMs: number | null;
  responseText: string;
  sources: CapturedAnswerSource[];
}

const INLINE_CITATION_PATTERN = /\[([A-Za-z][A-Za-z0-9._:-]*)\]/g;
const LOCAL_STREAM_EVENT_TYPES = new Set([
  "start",
  "source-document",
  "source-url",
]);

const optionalString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const readEventRecord = (
  event: TimedSseEvent
): Record<string, unknown> | null => {
  if (event.value === null || typeof event.value !== "object") {
    return null;
  }
  return asRecord(event.value, `SSE event ${event.sequence}`);
};

const readSource = (
  record: Record<string, unknown>
): CapturedAnswerSource | null => {
  const type = optionalString(record.type);
  if (type !== "source-document" && type !== "source-url") {
    return null;
  }
  const sourceId = optionalString(record.sourceId);
  if (!sourceId) {
    return null;
  }
  return {
    mediaType: optionalString(record.mediaType),
    sourceId,
    title: optionalString(record.title),
    url: optionalString(record.url),
  };
};

const readError = (record: Record<string, unknown>): string | null => {
  if (record.type !== "error") {
    return null;
  }
  return (
    optionalString(record.errorText) ??
    optionalString(record.message) ??
    optionalString(record.error) ??
    "Unspecified stream error"
  );
};

export const extractInlineCitations = (responseText: string): string[] => {
  const citations: string[] = [];
  for (const [, citation] of responseText.matchAll(INLINE_CITATION_PATTERN)) {
    if (citation && !citations.includes(citation)) {
      citations.push(citation);
    }
  }
  return citations;
};

interface AnswerEventAccumulator {
  errors: string[];
  firstProviderMs: number | null;
  firstTextMs: number | null;
  sources: CapturedAnswerSource[];
  textParts: string[];
}

const captureAnswerEvent = (
  state: AnswerEventAccumulator,
  event: TimedSseEvent
): void => {
  const record = readEventRecord(event);
  if (!record) {
    if (event.data && event.data !== "[DONE]") {
      state.errors.push(`Unparseable SSE data at event ${event.sequence}`);
    }
    return;
  }

  const type = optionalString(record.type);
  if (type && !LOCAL_STREAM_EVENT_TYPES.has(type)) {
    state.firstProviderMs ??= event.offsetMs;
  }

  const source = readSource(record);
  if (
    source &&
    !state.sources.some(({ sourceId }) => sourceId === source.sourceId)
  ) {
    state.sources.push(source);
  }

  if (type === "text-delta") {
    const delta = optionalString(record.delta);
    if (delta !== null) {
      state.firstTextMs ??= event.offsetMs;
      state.textParts.push(delta);
    }
  }

  const error = readError(record);
  if (error !== null) {
    state.errors.push(error);
  }
};

export const summarizeAnswerEvents = (
  events: readonly TimedSseEvent[]
): AnswerStreamSummary => {
  const state: AnswerEventAccumulator = {
    errors: [],
    firstProviderMs: null,
    firstTextMs: null,
    sources: [],
    textParts: [],
  };
  for (const event of events) {
    captureAnswerEvent(state, event);
  }

  const responseText = state.textParts.join("");
  const knownSourceIds = new Set(state.sources.map(({ sourceId }) => sourceId));
  const citations = extractInlineCitations(responseText);
  for (const citation of citations) {
    if (!knownSourceIds.has(citation)) {
      state.errors.push(`Citation references an unemitted source: ${citation}`);
    }
  }

  return {
    citations,
    errors: state.errors,
    firstProviderMs: state.firstProviderMs,
    firstTextMs: state.firstTextMs,
    responseText,
    sources: state.sources,
  };
};

export const validateMonotonicEventOffsets = (
  events: readonly TimedSseEvent[]
): void => {
  let previousOffset = 0;
  for (const event of events) {
    if (
      !Number.isFinite(event.offsetMs) ||
      event.offsetMs < 0 ||
      event.offsetMs < previousOffset
    ) {
      throw new Error("SSE event offsets must be finite and monotonic");
    }
    previousOffset = event.offsetMs;
  }
};
