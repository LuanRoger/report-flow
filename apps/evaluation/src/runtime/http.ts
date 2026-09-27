export interface HttpRequestOptions {
  apiKey: string;
  body?: unknown;
  method: "DELETE" | "GET" | "POST";
  rawBody?: string;
  runId: string;
  timeoutMs?: number;
  url: string;
}

export interface HttpRequestResult {
  durationMs: number;
  ok: boolean;
  responseBody: unknown;
  responseText: string;
  status: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

const parseResponseBody = (responseText: string): unknown => {
  if (!responseText) {
    return null;
  }
  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    return null;
  }
};

export const executeHttpRequest = async (
  options: HttpRequestOptions
): Promise<HttpRequestResult> => {
  if (!options.apiKey) {
    throw new Error("An API key is required for an evaluation HTTP request");
  }
  if (options.body !== undefined && options.rawBody !== undefined) {
    throw new Error("HTTP request cannot define both body and rawBody");
  }

  const start = performance.now();
  const response = await fetch(options.url, {
    body:
      options.rawBody ??
      (options.body === undefined ? undefined : JSON.stringify(options.body)),
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
      "X-Evaluation-Run-Id": options.runId,
    },
    method: options.method,
    signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
  const responseText = await response.text();

  return {
    durationMs: performance.now() - start,
    ok: response.ok,
    responseBody: parseResponseBody(responseText),
    responseText,
    status: response.status,
  };
};

export const boundedResponseText = (
  responseText: string,
  maximumLength = 2000
): string =>
  responseText.length <= maximumLength
    ? responseText
    : `${responseText.slice(0, maximumLength)}…`;
