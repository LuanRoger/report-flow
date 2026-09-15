import { check } from "k6";
import exec from "k6/execution";
import http from "k6/http";
import { Counter, Rate, Trend } from "k6/metrics";
import {
  assertExactWindowDays,
  assertLoadExecutionAllowed,
  assertVuCapacity,
  buildAuthorizationHeaders,
  buildConstantArrivalScenarios,
  expectedArrivalIterations,
  normalizeBaseUrl,
  readDuration,
  readEnv,
  readFiniteNumberList,
  readNonNegativeNumber,
  readPositiveInteger,
  readPositiveIntegerList,
  readUtcEpoch,
} from "./shared.js";

const parseJsonObject = (response) => {
  try {
    const value = response.json();

    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      return value;
    }
  } catch {
    return null;
  }

  return null;
};

export const createAnalysisProfile = ({
  defaultEndDate,
  defaultStartDate,
  profileId,
  windowDays,
}) => {
  const metricPrefix = `analysis_${windowDays}d`;
  const baseUrl = normalizeBaseUrl(
    readEnv("ANALYSIS_BASE_URL", "http://localhost:3001")
  );
  const apiKey = readEnv("ANALYSIS_API_KEY");
  const runId = readEnv("K6_RUN_ID");
  const repetition = readPositiveInteger("K6_REPETITION", 1);
  const targetRps = readPositiveInteger("K6_TARGET_RPS", 10);
  const warmupRps = readPositiveInteger("K6_WARMUP_RPS", targetRps);
  const duration = readDuration("K6_DURATION", "5m");
  const warmupDuration = readDuration("K6_WARMUP_DURATION", "1m");
  const requestTimeout = readDuration("K6_REQUEST_TIMEOUT", "30s");
  const preAllocatedVUs = readPositiveInteger("K6_PRE_ALLOCATED_VUS", 20);
  const maxVUs = readPositiveInteger("K6_MAX_VUS", 100);
  const p95TargetMs = readPositiveInteger("K6_P95_TARGET_MS", 2000);
  const pondIds = readPositiveIntegerList("K6_POND_IDS", "1");
  const expectedFinalScores = readFiniteNumberList("K6_EXPECTED_FINAL_SCORES");
  const scoreTolerance = readNonNegativeNumber("K6_SCORE_TOLERANCE", 0.05);
  const startEpoch = readUtcEpoch("K6_START_DATE", defaultStartDate);
  const endEpoch = readUtcEpoch("K6_END_DATE", defaultEndDate);

  assertExactWindowDays(startEpoch, endEpoch, windowDays);
  assertVuCapacity(preAllocatedVUs, maxVUs);

  if (
    expectedFinalScores.length > 0 &&
    expectedFinalScores.length !== pondIds.length
  ) {
    throw new Error(
      "K6_EXPECTED_FINAL_SCORES must contain one score for each K6_POND_IDS entry"
    );
  }

  if (expectedFinalScores.some((score) => score < 1 || score > 100)) {
    throw new Error("K6_EXPECTED_FINAL_SCORES values must be within [1, 100]");
  }

  const startDate = new Date(startEpoch).toISOString();
  const endDate = new Date(endEpoch).toISOString();
  const requestBody = JSON.stringify({
    endDate,
    generateAiSummary: false,
    generateEmbedding: false,
    startDate,
    window: "custom",
  });
  const authorizationHeaders = buildAuthorizationHeaders(apiKey, runId);

  const analysisRequests = new Counter(`${metricPrefix}_http_requests`);
  const analysisResultRowsConfirmed = new Counter(
    `${metricPrefix}_result_rows_persistence_confirmed`
  );
  const analysisMeasurementsRepresented = new Counter(
    `${metricPrefix}_measurements_represented`
  );
  const analysisHttpStatuses = new Counter(`${metricPrefix}_http_statuses`);
  const analysisRequestFailures = new Rate(`${metricPrefix}_request_failures`);
  const analysisContractFailures = new Rate(
    `${metricPrefix}_response_contract_failures`
  );
  const analysisOracleMismatches = new Rate(
    `${metricPrefix}_oracle_mismatches`
  );
  const analysisTotalDuration = new Trend(
    `${metricPrefix}_total_duration`,
    true
  );
  const analysisFinalScore = new Trend(`${metricPrefix}_final_score`);
  const analysisCoveragePercentage = new Trend(
    `${metricPrefix}_coverage_percentage`
  );

  const profileTags = {
    endpoint: "POST /analyses/ponds/:pondId",
    external_models: "disabled",
    profile: profileId,
    repetition: String(repetition),
    run_id: runId || "UNSET",
    window_days: String(windowDays),
  };

  const options = {
    discardResponseBodies: false,
    scenarios: buildConstantArrivalScenarios({
      duration,
      maxVUs,
      preAllocatedVUs,
      profileTags,
      targetRps,
      warmupDuration,
      warmupRps,
    }),
    summaryTrendStats: ["min", "avg", "med", "p(95)", "p(99)", "max"],
    thresholds: {
      [`${metricPrefix}_oracle_mismatches{phase:measurement}`]: ["rate==0"],
      [`${metricPrefix}_request_failures{phase:measurement}`]: ["rate<0.01"],
      [`${metricPrefix}_response_contract_failures{phase:measurement}`]: [
        "rate<0.01",
      ],
      "checks{phase:measurement}": ["rate>0.99"],
      dropped_iterations: ["count==0"],
      "http_req_duration{phase:measurement}": [`p(95)<${p95TargetMs}`],
    },
  };

  const setup = () => {
    assertLoadExecutionAllowed({
      apiKey,
      apiKeyEnvironmentName: "ANALYSIS_API_KEY",
      baseUrl,
      profileId,
      runId,
    });

    if (readEnv("K6_TARGET_HONORS_EMBEDDING_OPT_OUT") !== "true") {
      throw new Error(
        `${profileId} execution blocked: set K6_TARGET_HONORS_EMBEDDING_OPT_OUT=true only after verifying the target does not generate embeddings when generateEmbedding=false`
      );
    }

    if (expectedFinalScores.length !== pondIds.length) {
      throw new Error(
        `${profileId} execution blocked: set K6_EXPECTED_FINAL_SCORES with one independent-oracle score per pond ID`
      );
    }

    return {
      expectedFinalScores,
      expectedMeasurementRequests: expectedArrivalIterations(
        targetRps,
        duration
      ),
      expectedResultRowsPerSuccessfulRequest: 1,
      externalModels: "disabled",
      profileId,
      runId,
      targetRps,
      window: {
        endDate,
        startDate,
      },
    };
  };

  const runAnalysisRequest = (phase) => {
    const targetIndex = exec.scenario.iterationInTest % pondIds.length;
    const pondId = pondIds[targetIndex];
    const expectedFinalScore = expectedFinalScores[targetIndex];
    const metricTags = {
      phase,
      pond_id: String(pondId),
      window_days: String(windowDays),
    };

    analysisRequests.add(1, metricTags);

    const response = http.post(
      `${baseUrl}/analyses/ponds/${pondId}`,
      requestBody,
      {
        headers: authorizationHeaders,
        tags: metricTags,
        timeout: requestTimeout,
      }
    );
    const responseBody = parseJsonObject(response);
    const finalScore = responseBody?.finalScore;
    const coveragePercentage =
      responseBody?.metadata?.executionStats?.dataCoverage?.coveragePercentage;
    const measurementsRepresented =
      responseBody?.metadata?.executionStats?.totalMeasurements;
    const hasSuccessfulStatus = response.status === 200;
    const hasValidFinalScore =
      typeof finalScore === "number" && finalScore >= 1 && finalScore <= 100;
    const matchesOracle =
      hasValidFinalScore &&
      typeof expectedFinalScore === "number" &&
      Math.abs(finalScore - expectedFinalScore) <= scoreTolerance;
    const hasRequestedPond = responseBody?.pondId === pondId;
    const hasRequestedWindow =
      Date.parse(responseBody?.startDate) === startEpoch &&
      Date.parse(responseBody?.endDate) === endEpoch;
    const hasNoAiSummary = responseBody?.aiSummary === null;
    const hasHalfOpenWindowConvention =
      responseBody?.metadata?.windowConvention === "[start,end)";
    const hasValidContract =
      hasSuccessfulStatus &&
      hasValidFinalScore &&
      hasRequestedPond &&
      hasRequestedWindow &&
      hasNoAiSummary &&
      hasHalfOpenWindowConvention;

    analysisHttpStatuses.add(1, {
      ...metricTags,
      status: String(response.status),
    });
    analysisTotalDuration.add(response.timings.duration, metricTags);
    analysisRequestFailures.add(!hasSuccessfulStatus, metricTags);
    analysisContractFailures.add(!hasValidContract, metricTags);
    analysisOracleMismatches.add(!matchesOracle, metricTags);

    check(
      response,
      {
        "analysis final score matches the independent oracle": () =>
          matchesOracle,
        "analysis response matches the requested pond": () => hasRequestedPond,
        "analysis response omits the AI summary": () => hasNoAiSummary,
        "analysis response uses the requested half-open window": () =>
          hasRequestedWindow && hasHalfOpenWindowConvention,
        "analysis returns 200": (result) => result.status === 200,
        "analysis returns a final score in [1, 100]": () => hasValidFinalScore,
      },
      metricTags
    );

    if (!hasSuccessfulStatus) {
      return;
    }

    analysisResultRowsConfirmed.add(1, metricTags);

    if (typeof measurementsRepresented === "number") {
      analysisMeasurementsRepresented.add(measurementsRepresented, metricTags);
    }

    if (typeof finalScore === "number") {
      analysisFinalScore.add(finalScore, metricTags);
    }

    if (typeof coveragePercentage === "number") {
      analysisCoveragePercentage.add(coveragePercentage, metricTags);
    }
  };

  const warmup = () => {
    runAnalysisRequest("warmup");
  };

  const measure = () => {
    runAnalysisRequest("measurement");
  };

  return {
    measure,
    options,
    setup,
    warmup,
  };
};
