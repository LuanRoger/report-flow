export interface ParsedSseEvent {
  data: string;
  event: string | null;
  id: string | null;
  raw: string;
  retry: number | null;
  value: unknown;
}

export interface TimedSseEvent extends ParsedSseEvent {
  offsetMs: number;
  sequence: number;
}

export interface ConsumedSseStream {
  events: TimedSseEvent[];
  firstStreamMs: number | null;
  totalMs: number;
}

const EVENT_BOUNDARY_PATTERN = /\r\n\r\n|\n\n|\r\r/;
const LINE_BOUNDARY_PATTERN = /\r\n|\n|\r/;

const parseEventValue = (data: string): unknown => {
  if (data === "[DONE]") {
    return null;
  }

  try {
    return JSON.parse(data) as unknown;
  } catch {
    return data;
  }
};

interface MutableSseEvent {
  dataLines: string[];
  event: string | null;
  id: string | null;
  retry: number | null;
}

const applyEventLine = (state: MutableSseEvent, line: string): void => {
  if (!line || line.startsWith(":")) {
    return;
  }

  const separatorIndex = line.indexOf(":");
  const field = separatorIndex === -1 ? line : line.slice(0, separatorIndex);
  const rawValue = separatorIndex === -1 ? "" : line.slice(separatorIndex + 1);
  const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;

  if (field === "data") {
    state.dataLines.push(value);
    return;
  }
  if (field === "event") {
    state.event = value || null;
    return;
  }
  if (field === "id" && !value.includes("\0")) {
    state.id = value;
    return;
  }
  if (field !== "retry") {
    return;
  }

  const parsedRetry = Number(value);
  if (Number.isSafeInteger(parsedRetry) && parsedRetry >= 0) {
    state.retry = parsedRetry;
  }
};

const parseEventBlock = (raw: string): ParsedSseEvent => {
  const state: MutableSseEvent = {
    dataLines: [],
    event: null,
    id: null,
    retry: null,
  };
  for (const line of raw.split(LINE_BOUNDARY_PATTERN)) {
    applyEventLine(state, line);
  }

  const data = state.dataLines.join("\n");
  return {
    data,
    event: state.event,
    id: state.id,
    raw,
    retry: state.retry,
    value: parseEventValue(data),
  };
};

export class SseParser {
  readonly #events: ParsedSseEvent[] = [];
  #buffer = "";

  push(chunk: string): ParsedSseEvent[] {
    this.#buffer += chunk;
    const parsed: ParsedSseEvent[] = [];

    let boundaryIndex = this.#buffer.search(EVENT_BOUNDARY_PATTERN);
    while (boundaryIndex >= 0) {
      const raw = this.#buffer.slice(0, boundaryIndex);
      const boundaryLength = this.#buffer.startsWith("\r\n\r\n", boundaryIndex)
        ? 4
        : 2;
      this.#buffer = this.#buffer.slice(boundaryIndex + boundaryLength);
      if (raw.length > 0) {
        parsed.push(parseEventBlock(raw));
      }
      boundaryIndex = this.#buffer.search(EVENT_BOUNDARY_PATTERN);
    }

    this.#events.push(...parsed);
    return parsed;
  }

  finish(): ParsedSseEvent[] {
    if (this.#buffer.length === 0) {
      return [];
    }

    const event = parseEventBlock(this.#buffer);
    this.#buffer = "";
    this.#events.push(event);
    return [event];
  }

  events(): readonly ParsedSseEvent[] {
    return this.#events;
  }
}

export const parseSseText = (text: string): ParsedSseEvent[] => {
  const parser = new SseParser();
  return [...parser.push(text), ...parser.finish()];
};

interface ConsumeSseStreamOptions {
  now?: () => number;
  startedAt: number;
}

export const consumeSseStream = async (
  body: ReadableStream<Uint8Array> | null,
  options: ConsumeSseStreamOptions
): Promise<ConsumedSseStream> => {
  if (!body) {
    throw new Error("Streaming response did not include a response body");
  }

  const now = options.now ?? performance.now.bind(performance);
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser();
  const events: TimedSseEvent[] = [];
  let firstStreamMs: number | null = null;
  let lastOffsetMs = 0;

  const captureEvents = (parsedEvents: readonly ParsedSseEvent[]): void => {
    for (const event of parsedEvents) {
      const measuredOffset = Math.max(0, now() - options.startedAt);
      const offsetMs = Math.max(lastOffsetMs, measuredOffset);
      lastOffsetMs = offsetMs;
      firstStreamMs ??= offsetMs;
      events.push({
        ...event,
        offsetMs,
        sequence: events.length,
      });
    }
  };

  let chunk = await reader.read();
  while (!chunk.done) {
    captureEvents(parser.push(decoder.decode(chunk.value, { stream: true })));
    // biome-ignore lint/performance/noAwaitInLoops: Stream chunks must be consumed in wire order.
    chunk = await reader.read();
  }

  captureEvents(parser.push(decoder.decode()));
  captureEvents(parser.finish());
  const totalMs = Math.max(
    lastOffsetMs,
    Math.max(0, now() - options.startedAt)
  );

  return { events, firstStreamMs, totalMs };
};
