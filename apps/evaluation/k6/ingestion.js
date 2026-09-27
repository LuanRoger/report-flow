import { check } from "k6";
import exec from "k6/execution";
import http from "k6/http";
import { Counter, Rate, Trend } from "k6/metrics";
import {
  assertLoadExecutionAllowed,
  assertVuCapacity,
  buildAuthorizationHeaders,
  buildConstantArrivalScenarios,
  ceilToMultiple,
  expectedArrivalIterations,
  normalizeBaseUrl,
  readDuration,
  readEnv,
  readPositiveInteger,
  readPositiveIntegerList,
  readUtcEpoch,
} from "./shared.js";

const PROFILE_ID = "manual-ingestion";
const PARAMETER_RECORDS = [
  { parameterCode: "temperature", unit: "°C", value: 30 },
  { parameterCode: "ph", unit: "pH", value: 8 },
  { parameterCode: "salinity", unit: "ppt", value: 20 },
  { parameterCode: "dissolvedOxygen", unit: "mg/L", value: 5 },
];
const COLLECTION_INTERVAL_MS = 10_000;

const BASE_URL = normalizeBaseUrl(
  readEnv("INGEST_BASE_URL", "http://localhost:3000")
);
const API_KEY = readEnv("INGEST_API_KEY");
const RUN_ID = readEnv("K6_RUN_ID");
const REPETITION = readPositiveInteger("K6_REPETITION", 1);
const TARGET_RPS = readPositiveInteger("K6_TARGET_RPS", 50);
const WARMUP_RPS = readPositiveInteger("K6_WARMUP_RPS", TARGET_RPS);
const DURATION = readDuration("K6_DURATION", "5m");
const WARMUP_DURATION = readDuration("K6_WARMUP_DURATION", "1m");
const REQUEST_TIMEOUT = readDuration("K6_REQUEST_TIMEOUT", "30s");
const PRE_ALLOCATED_VUS = readPositiveInteger("K6_PRE_ALLOCATED_VUS", 50);
const MAX_VUS = readPositiveInteger("K6_MAX_VUS", 200);
const P95_TARGET_MS = readPositiveInteger("K6_P95_TARGET_MS", 500);
const POND_IDS = readPositiveIntegerList("K6_POND_IDS", "1");
const CYCLE_IDS = readPositiveIntegerList("K6_CYCLE_IDS", "1");
const START_EPOCH = readUtcEpoch("K6_START_DATE", "2026-01-01T00:00:00.000Z");
const END_EPOCH = readUtcEpoch("K6_END_DATE", "2026-01-08T00:00:00.000Z");

if (POND_IDS.length !== CYCLE_IDS.length) {
  throw new Error(
    "K6_POND_IDS and K6_CYCLE_IDS must contain the same number of IDs"
  );
}

if (END_EPOCH <= START_EPOCH) {
  throw new Error("K6_END_DATE must be later than K6_START_DATE");
}

assertVuCapacity(PRE_ALLOCATED_VUS, MAX_VUS);

const INGESTION_TARGETS = POND_IDS.map((pondId, index) => ({
  cycleId: CYCLE_IDS[index],
  pondId,
}));
const ROWS_PER_COMPLETE_TIMESTAMP =
  PARAMETER_RECORDS.length * INGESTION_TARGETS.length;
const EXPECTED_WARMUP_ROWS = expectedArrivalIterations(
  WARMUP_RPS,
  WARMUP_DURATION
);
const EXPECTED_MEASUREMENT_ROWS = expectedArrivalIterations(
  TARGET_RPS,
  DURATION
);
const MEASUREMENT_ROW_OFFSET = ceilToMultiple(
  EXPECTED_WARMUP_ROWS,
  ROWS_PER_COMPLETE_TIMESTAMP
);
const LAST_RESERVED_ROW_INDEX =
  MEASUREMENT_ROW_OFFSET + EXPECTED_MEASUREMENT_ROWS - 1;
const LAST_RESERVED_COLLECTION_INDEX = Math.floor(
  LAST_RESERVED_ROW_INDEX / PARAMETER_RECORDS.length
);
const LAST_RESERVED_TIMESTAMP_INDEX = Math.floor(
  LAST_RESERVED_COLLECTION_INDEX / INGESTION_TARGETS.length
);
const LAST_RESERVED_TIMESTAMP =
  START_EPOCH + LAST_RESERVED_TIMESTAMP_INDEX * COLLECTION_INTERVAL_MS;

if (LAST_RESERVED_TIMESTAMP >= END_EPOCH) {
  throw new Error(
    "The configured ingestion date range is too short for the requested rates and durations"
  );
}

const authorizationHeaders = buildAuthorizationHeaders(API_KEY, RUN_ID);

const ingestionRequests = new Counter("ingestion_http_requests");
const submittedParameterRows = new Counter(
  "ingestion_parameter_rows_submitted"
);
const persistenceConfirmedRows = new Counter(
  "ingestion_parameter_rows_persistence_confirmed"
);
const rejectedParameterRows = new Counter("ingestion_parameter_rows_rejected");
const ingestionRequestFailures = new Rate("ingestion_request_failures");
const persistenceConfirmationDuration = new Trend(
  "ingestion_persistence_confirmation_duration",
  true
);
const ingestionHttpStatuses = new Counter("ingestion_http_statuses");

const profileTags = {
  endpoint: "POST /ingest/manual",
  profile: PROFILE_ID,
  repetition: String(REPETITION),
  row_contract: "one-request-one-parameter-row",
  run_id: RUN_ID || "UNSET",
};

export const options = {
  discardResponseBodies: true,
  scenarios: buildConstantArrivalScenarios({
    duration: DURATION,
    maxVUs: MAX_VUS,
    preAllocatedVUs: PRE_ALLOCATED_VUS,
    profileTags,
    targetRps: TARGET_RPS,
    warmupDuration: WARMUP_DURATION,
    warmupRps: WARMUP_RPS,
  }),
  summaryTrendStats: ["min", "avg", "med", "p(95)", "p(99)", "max"],
  thresholds: {
    "checks{phase:measurement}": ["rate>0.99"],
    dropped_iterations: ["count==0"],
    "http_req_duration{phase:measurement}": [`p(95)<${P95_TARGET_MS}`],
    "ingestion_request_failures{phase:measurement}": ["rate<0.01"],
  },
};

export const setup = () => {
  assertLoadExecutionAllowed({
    apiKey: API_KEY,
    apiKeyEnvironmentName: "INGEST_API_KEY",
    baseUrl: BASE_URL,
    profileId: PROFILE_ID,
    runId: RUN_ID,
  });

  return {
    dateRange: [
      new Date(START_EPOCH).toISOString(),
      new Date(END_EPOCH).toISOString(),
    ],
    expectedMeasurementRequests: EXPECTED_MEASUREMENT_ROWS,
    expectedRowsPerSuccessfulRequest: 1,
    profileId: PROFILE_ID,
    runId: RUN_ID,
    targetRps: TARGET_RPS,
  };
};

const buildPayload = (rowIndex) => {
  const parameter = PARAMETER_RECORDS[rowIndex % PARAMETER_RECORDS.length];
  const collectionIndex = Math.floor(rowIndex / PARAMETER_RECORDS.length);
  const targetIndex = collectionIndex % INGESTION_TARGETS.length;
  const timestampIndex = Math.floor(collectionIndex / INGESTION_TARGETS.length);
  const target = INGESTION_TARGETS[targetIndex];

  return {
    cycleId: target.cycleId,
    parameterCode: parameter.parameterCode,
    pondId: target.pondId,
    recordedAt: new Date(
      START_EPOCH + timestampIndex * COLLECTION_INTERVAL_MS
    ).toISOString(),
    sourceType: "manual",
    unit: parameter.unit,
    value: parameter.value,
  };
};

const runIngestionRequest = (phase, rowOffset) => {
  const rowIndex = rowOffset + exec.scenario.iterationInTest;
  const payload = buildPayload(rowIndex);
  const metricTags = {
    cycle_id: String(payload.cycleId),
    parameter_code: payload.parameterCode,
    phase,
    pond_id: String(payload.pondId),
  };

  ingestionRequests.add(1, metricTags);
  submittedParameterRows.add(1, metricTags);

  const response = http.post(
    `${BASE_URL}/ingest/manual`,
    JSON.stringify(payload),
    {
      headers: authorizationHeaders,
      tags: metricTags,
      timeout: REQUEST_TIMEOUT,
    }
  );
  const persistenceConfirmed = response.status === 201;

  ingestionHttpStatuses.add(1, {
    ...metricTags,
    status: String(response.status),
  });
  persistenceConfirmationDuration.add(response.timings.duration, metricTags);
  ingestionRequestFailures.add(!persistenceConfirmed, metricTags);

  check(
    response,
    {
      "manual ingestion confirms one persisted row with 201": (result) =>
        result.status === 201,
      "manual ingestion has no server error": (result) => result.status < 500,
    },
    metricTags
  );

  if (persistenceConfirmed) {
    persistenceConfirmedRows.add(1, metricTags);
    return;
  }

  rejectedParameterRows.add(1, metricTags);
};

export const warmup = () => {
  runIngestionRequest("warmup", 0);
};

export const measure = () => {
  runIngestionRequest("measurement", MEASUREMENT_ROW_OFFSET);
};
