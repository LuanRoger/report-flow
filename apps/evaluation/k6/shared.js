const ENVIRONMENT = globalThis.__ENV ?? {};

const DURATION_PATTERN = /^([1-9]\d*)(ms|s|m|h)$/;
const HTTP_BASE_URL_PATTERN = /^https?:\/\/[^\s/]+(?:\/.*)?$/i;
const LOOPBACK_BASE_URL_PATTERN =
  /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/.*)?$/i;
const TRAILING_SLASH_PATTERN = /\/+$/;

const DURATION_MULTIPLIERS_MS = {
  h: 3_600_000,
  m: 60_000,
  ms: 1,
  s: 1000,
};

export const readEnv = (name, fallback = "") => {
  const value = ENVIRONMENT[name];

  if (typeof value !== "string" || value.trim() === "") {
    return fallback;
  }

  return value.trim();
};

export const readPositiveInteger = (name, fallback) => {
  const rawValue = readEnv(name, String(fallback));
  const value = Number(rawValue);

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(
      `${name} must be a positive integer; received "${rawValue}"`
    );
  }

  return value;
};

export const readPositiveIntegerList = (name, fallback) => {
  const rawValue = readEnv(name, fallback);
  const parts = rawValue.split(",").map((part) => part.trim());

  if (parts.some((part) => part === "")) {
    throw new Error(
      `${name} must be a comma-separated list of positive integers`
    );
  }

  return parts.map((part) => {
    const value = Number(part);

    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(
        `${name} contains an invalid positive integer: "${part}"`
      );
    }

    return value;
  });
};

export const readFiniteNumberList = (name) => {
  const rawValue = readEnv(name);

  if (!rawValue) {
    return [];
  }

  const parts = rawValue.split(",").map((part) => part.trim());

  if (parts.some((part) => part === "")) {
    throw new Error(`${name} must be a comma-separated list of numbers`);
  }

  return parts.map((part) => {
    const value = Number(part);

    if (!Number.isFinite(value)) {
      throw new Error(`${name} contains an invalid number: "${part}"`);
    }

    return value;
  });
};

export const readNonNegativeNumber = (name, fallback) => {
  const rawValue = readEnv(name, String(fallback));
  const value = Number(rawValue);

  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `${name} must be a non-negative number; received "${rawValue}"`
    );
  }

  return value;
};

export const readDuration = (name, fallback) => {
  const duration = readEnv(name, fallback);

  if (!DURATION_PATTERN.test(duration)) {
    throw new Error(
      `${name} must use one positive integer and one k6 unit (ms, s, m, or h); received "${duration}"`
    );
  }

  return duration;
};

export const durationToMilliseconds = (duration) => {
  const match = DURATION_PATTERN.exec(duration);

  if (!match) {
    throw new Error(`Invalid duration: "${duration}"`);
  }

  const [, amountText, unit] = match;
  const amount = Number(amountText);
  return amount * DURATION_MULTIPLIERS_MS[unit];
};

export const readUtcEpoch = (name, fallback) => {
  const value = readEnv(name, fallback);
  const epochMilliseconds = Date.parse(value);

  if (
    !Number.isFinite(epochMilliseconds) ||
    new Date(epochMilliseconds).toISOString() !== value
  ) {
    throw new Error(
      `${name} must be a canonical UTC timestamp such as 2026-01-01T00:00:00.000Z`
    );
  }

  return epochMilliseconds;
};

export const normalizeBaseUrl = (baseUrl) =>
  baseUrl.replace(TRAILING_SLASH_PATTERN, "");

export const ceilToMultiple = (value, multiple) =>
  Math.ceil(value / multiple) * multiple;

export const expectedArrivalIterations = (rate, duration) =>
  Math.ceil((rate * durationToMilliseconds(duration)) / 1000);

export const assertExactWindowDays = (startEpoch, endEpoch, days) => {
  const expectedDurationMilliseconds = days * 24 * 60 * 60 * 1000;
  const actualDurationMilliseconds = endEpoch - startEpoch;

  if (actualDurationMilliseconds !== expectedDurationMilliseconds) {
    throw new Error(
      `The configured dates must span exactly ${days} days; received ${actualDurationMilliseconds / 86_400_000} days`
    );
  }
};

export const assertVuCapacity = (preAllocatedVUs, maxVUs) => {
  if (maxVUs < preAllocatedVUs) {
    throw new Error(
      "K6_MAX_VUS must be greater than or equal to K6_PRE_ALLOCATED_VUS"
    );
  }
};

export const assertLoadExecutionAllowed = ({
  apiKey,
  apiKeyEnvironmentName,
  baseUrl,
  profileId,
  runId,
}) => {
  const errors = [];

  if (readEnv("K6_ALLOW_LOAD_TEST") !== "true") {
    errors.push("set K6_ALLOW_LOAD_TEST=true");
  }

  if (!runId) {
    errors.push("set a non-empty K6_RUN_ID");
  }

  if (!apiKey) {
    errors.push(`set ${apiKeyEnvironmentName}`);
  }

  if (!HTTP_BASE_URL_PATTERN.test(baseUrl)) {
    errors.push("configure an http:// or https:// base URL");
  }

  if (
    HTTP_BASE_URL_PATTERN.test(baseUrl) &&
    !LOOPBACK_BASE_URL_PATTERN.test(baseUrl) &&
    readEnv("K6_ALLOW_REMOTE_TARGET") !== "true"
  ) {
    errors.push("set K6_ALLOW_REMOTE_TARGET=true for a non-loopback target");
  }

  if (errors.length > 0) {
    throw new Error(`${profileId} execution blocked: ${errors.join("; ")}`);
  }
};

export const buildAuthorizationHeaders = (apiKey, runId) => ({
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
  "X-Evaluation-Run-Id": runId,
});

export const buildConstantArrivalScenarios = ({
  duration,
  maxVUs,
  preAllocatedVUs,
  profileTags,
  targetRps,
  warmupDuration,
  warmupRps,
}) => ({
  measurement: {
    duration,
    exec: "measure",
    executor: "constant-arrival-rate",
    gracefulStop: "0s",
    maxVUs,
    preAllocatedVUs,
    rate: targetRps,
    startTime: warmupDuration,
    tags: {
      ...profileTags,
      phase: "measurement",
    },
    timeUnit: "1s",
  },
  warmup: {
    duration: warmupDuration,
    exec: "warmup",
    executor: "constant-arrival-rate",
    gracefulStop: "0s",
    maxVUs,
    preAllocatedVUs,
    rate: warmupRps,
    tags: {
      ...profileTags,
      phase: "warmup",
    },
    timeUnit: "1s",
  },
});
