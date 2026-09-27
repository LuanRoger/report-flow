import { artifactStore } from "../runtime/artifacts.ts";
import { asRecord } from "../shared/validation.ts";

export type EvaluationStatus = "fail" | "not-executed" | "pass";

interface AcceptanceIndicator {
  evidence: string[];
  id: string;
  observed: string;
  status: EvaluationStatus;
  target: string;
}

interface ArtifactRecord {
  file: string;
  value: Record<string, unknown>;
}

interface ArtifactGroups {
  analysis: ArtifactRecord[];
  answers: ArtifactRecord[];
  ingestion: ArtifactRecord[];
  plans: ArtifactRecord[];
  retrieval: ArtifactRecord[];
  sequential: ArtifactRecord[];
}

export interface EvaluationReportResult {
  artifacts: string[];
  generatedAt: string;
  indicators: AcceptanceIndicator[];
  initialNonMqttEvaluationComplete: boolean;
  mqttStatus: "not-executed";
  runId: string;
  schemaVersion: 1;
}

const ANALYSIS_SUMMARY_PATTERN = /^correctness\/analysis-summary-.*\.json$/;
const ANSWER_SCORE_PATTERN = /^rag\/answers\/score-.*\.json$/;
const INGESTION_SUMMARY_PATTERN = /^ingestion\/summary-.*\.json$/;
const PLAN_SUMMARY_PATTERN = /^performance\/query-plans\/summary-.*\.json$/;
const RETRIEVAL_SCORE_PATTERN = /^rag\/retrieval\/score-.*\.json$/;
const SEQUENTIAL_PATTERN = /^performance\/sequential\/.*\.json$/;

const readMatchingJson = async (
  runId: string,
  files: readonly string[],
  pattern: RegExp
): Promise<ArtifactRecord[]> =>
  await Promise.all(
    files
      .filter((file) => pattern.test(file))
      .map(async (file) => ({
        file,
        value: asRecord(await artifactStore.readJson(runId, file), file),
      }))
  );

const loadArtifactGroups = async (
  runId: string,
  files: readonly string[]
): Promise<ArtifactGroups> => {
  const [analysis, answers, ingestion, plans, retrieval, sequential] =
    await Promise.all([
      readMatchingJson(runId, files, ANALYSIS_SUMMARY_PATTERN),
      readMatchingJson(runId, files, ANSWER_SCORE_PATTERN),
      readMatchingJson(runId, files, INGESTION_SUMMARY_PATTERN),
      readMatchingJson(runId, files, PLAN_SUMMARY_PATTERN),
      readMatchingJson(runId, files, RETRIEVAL_SCORE_PATTERN),
      readMatchingJson(runId, files, SEQUENTIAL_PATTERN),
    ]);
  return { analysis, answers, ingestion, plans, retrieval, sequential };
};

const booleanStatus = (values: readonly boolean[]): EvaluationStatus => {
  if (values.length === 0) {
    return "not-executed";
  }
  return values.every(Boolean) ? "pass" : "fail";
};

const thresholdStatus = (
  values: readonly number[],
  predicate: (value: number) => boolean
): EvaluationStatus => {
  if (values.length === 0) {
    return "not-executed";
  }
  return values.every(predicate) ? "pass" : "fail";
};

const numberValue = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const compactNumbers = (values: readonly (number | null)[]): number[] =>
  values.filter((value): value is number => value !== null);

const formatNumber = (value: number | null, digits = 4): string =>
  value === null ? "not observed" : value.toFixed(digits);

const maximum = (values: readonly number[]): number | null =>
  values.length === 0 ? null : Math.max(...values);

const minimum = (values: readonly number[]): number | null =>
  values.length === 0 ? null : Math.min(...values);

const nestedRate = (
  artifacts: readonly ArtifactRecord[],
  field: string
): number[] =>
  compactNumbers(
    artifacts.map(({ value }) => {
      const metric = value[field];
      if (!metric || typeof metric !== "object" || Array.isArray(metric)) {
        return null;
      }
      return numberValue((metric as Record<string, unknown>).rate);
    })
  );

const latencyP95 = (
  artifacts: readonly ArtifactRecord[],
  field: "totalMs" | "ttftMs"
): number[] =>
  compactNumbers(
    artifacts.map(({ value }) => {
      const { latency } = value;
      if (!latency || typeof latency !== "object" || Array.isArray(latency)) {
        return null;
      }
      const distribution = (latency as Record<string, unknown>)[field];
      if (
        !distribution ||
        typeof distribution !== "object" ||
        Array.isArray(distribution)
      ) {
        return null;
      }
      return numberValue((distribution as Record<string, unknown>).p95);
    })
  );

const scorePrecisionStatus = (
  meanErrors: readonly number[],
  maximumErrors: readonly number[]
): EvaluationStatus => {
  const largestMeanError = maximum(meanErrors);
  const largestAbsoluteError = maximum(maximumErrors);
  if (largestMeanError === null || largestAbsoluteError === null) {
    return "not-executed";
  }
  return largestMeanError <= 0.01 && largestAbsoluteError <= 0.05
    ? "pass"
    : "fail";
};

const invalidRejectionRates = (
  artifacts: readonly ArtifactRecord[]
): number[] =>
  compactNumbers(
    artifacts.map(({ value }) => {
      const { c7 } = value;
      if (!c7 || typeof c7 !== "object" || Array.isArray(c7)) {
        return null;
      }
      return numberValue((c7 as Record<string, unknown>).invalidRejectionRate);
    })
  );

const scoreErrors = (
  artifacts: readonly ArtifactRecord[],
  field: "maximumAbsoluteError" | "meanAbsoluteError"
): number[] =>
  compactNumbers(
    artifacts.map(({ value }) => {
      const aggregate = asRecord(
        value.aggregateScoreError,
        "aggregateScoreError"
      );
      return numberValue(aggregate[field]);
    })
  );

const buildIndicators = (groups: ArtifactGroups): AcceptanceIndicator[] => {
  const ingestionRatios = compactNumbers(
    groups.ingestion.map(({ value }) =>
      numberValue(value.validPersistenceRatio)
    )
  );
  const invalidRates = invalidRejectionRates(groups.ingestion);
  const scoreMae = scoreErrors(groups.analysis, "meanAbsoluteError");
  const scoreMaximum = scoreErrors(groups.analysis, "maximumAbsoluteError");
  const retrievalRecall = compactNumbers(
    groups.retrieval.map(({ value }) => numberValue(value.meanRecallAt5))
  );
  const factualAccuracy = nestedRate(groups.answers, "factualAccuracy");
  const groundedness = nestedRate(groups.answers, "groundedness");
  const abstention = nestedRate(groups.answers, "abstention");
  const ttft = latencyP95(groups.answers, "ttftMs");
  const total = latencyP95(groups.answers, "totalMs");
  const files = (artifacts: readonly ArtifactRecord[]): string[] =>
    artifacts.map(({ file }) => file);
  const formatMilliseconds = (value: number | null): string =>
    value === null ? "not observed" : `${value.toFixed(2)} ms`;

  return [
    {
      evidence: files(groups.ingestion),
      id: "http-ingestion-integrity",
      observed: `minimum ratio ${formatNumber(minimum(ingestionRatios))}`,
      status: thresholdStatus(ingestionRatios, (ratio) => ratio === 1),
      target: "100% of controlled valid rows persisted",
    },
    {
      evidence: files(groups.ingestion),
      id: "invalid-input-rejection",
      observed: `minimum rate ${formatNumber(minimum(invalidRates))}`,
      status: thresholdStatus(invalidRates, (rate) => rate === 1),
      target: "100% of C7 invalid cases rejected",
    },
    {
      evidence: files(groups.analysis),
      id: "score-precision",
      observed: `maximum MAE ${formatNumber(maximum(scoreMae), 6)}; maximum absolute error ${formatNumber(maximum(scoreMaximum), 6)}`,
      status: scorePrecisionStatus(scoreMae, scoreMaximum),
      target: "MAE <= 0.01 and maximum absolute error <= 0.05",
    },
    {
      evidence: files(groups.sequential),
      id: "sequential-analysis",
      observed: `${groups.sequential.length} benchmark artifact(s)`,
      status: booleanStatus(
        groups.sequential.map(({ value }) => value.passed === true)
      ),
      target: "Every measured response matches the oracle",
    },
    {
      evidence: files(groups.plans),
      id: "timescaledb-plans",
      observed: `${groups.plans.length} plan summary artifact(s)`,
      status: booleanStatus(
        groups.plans.map(({ value }) => value.passed === true)
      ),
      target: "Representative plans captured with execution timing",
    },
    {
      evidence: files(groups.retrieval),
      id: "rag-retrieval",
      observed: `minimum mean Recall@5 ${formatNumber(minimum(retrievalRecall))}`,
      status: thresholdStatus(retrievalRecall, (value) => value >= 0.9),
      target: "Mean Recall@5 >= 90%",
    },
    {
      evidence: files(groups.answers),
      id: "rag-factual-accuracy",
      observed: `minimum rate ${formatNumber(minimum(factualAccuracy))}`,
      status: thresholdStatus(factualAccuracy, (value) => value >= 0.9),
      target: "Factual accuracy >= 90%",
    },
    {
      evidence: files(groups.answers),
      id: "rag-groundedness",
      observed: `minimum rate ${formatNumber(minimum(groundedness))}`,
      status: thresholdStatus(groundedness, (value) => value >= 0.9),
      target: "Groundedness >= 90%",
    },
    {
      evidence: files(groups.answers),
      id: "rag-abstention",
      observed: `minimum rate ${formatNumber(minimum(abstention))}`,
      status: thresholdStatus(abstention, (value) => value === 1),
      target: "Correct abstention = 100%",
    },
    {
      evidence: files(groups.answers),
      id: "rag-first-response",
      observed: `maximum p95 ${formatMilliseconds(maximum(ttft))}`,
      status: thresholdStatus(ttft, (value) => value <= 3000),
      target: "p95 time to first segment <= 3000 ms",
    },
    {
      evidence: files(groups.answers),
      id: "rag-complete-response",
      observed: `maximum p95 ${formatMilliseconds(maximum(total))}`,
      status: thresholdStatus(total, (value) => value <= 10_000),
      target: "p95 completion <= 10000 ms",
    },
    {
      evidence: [],
      id: "k6-ingestion-latency",
      observed:
        "k6 summaries are not automatically inferred from arbitrary output files",
      status: "not-executed",
      target: "50 RPS p95 <= 500 ms and error rate < 1%",
    },
    {
      evidence: [],
      id: "k6-analysis-latency",
      observed:
        "k6 summaries are not automatically inferred from arbitrary output files",
      status: "not-executed",
      target: "30-day 10 RPS p95 <= 2 s and error rate < 1%",
    },
    {
      evidence: [],
      id: "mqtt-ingestion",
      observed: "Deferred until the MQTT subscriber and sensors are available",
      status: "not-executed",
      target: "100% controlled valid persistence and invalid rejection",
    },
  ];
};

const markdownTable = (indicators: readonly AcceptanceIndicator[]): string => {
  const rows = indicators.map(
    (indicator) =>
      `| ${indicator.id} | ${indicator.target} | ${indicator.observed} | ${indicator.status} | ${indicator.evidence.join(", ") || "none"} |`
  );
  return [
    "| Indicator | Target | Observed | Status | Evidence |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
};

const buildSummaryMarkdown = (
  result: EvaluationReportResult
): string => `# Evaluation validation summary

- Run ID: \`${result.runId}\`
- Generated: ${result.generatedAt}
- Initial non-MQTT evaluation complete: **${result.initialNonMqttEvaluationComplete ? "yes" : "no"}**
- MQTT: **not executed**

${markdownTable(result.indicators)}

## Interpretation boundary

These artifacts evaluate numerical fidelity, ingestion integrity, retrieval/answer behavior, and implementation performance under the recorded environment. They do not establish biological validity of the scoring model.
`;

const LIMITATIONS_MARKDOWN = `# Evaluation limitations

1. The symmetric dissolved-oxygen function penalizes values above 5 mg/L because this is the adopted thesis function.
2. Gaussian sigma values, the threshold of 50, parameter weights, the 20-second continuity cap, and the 70% coverage threshold are project assumptions requiring separate scientific validation.
3. Agreement with the independent oracle demonstrates implementation fidelity, not biological accuracy.
4. Performance results apply only to the recorded implementation, dataset, database, hardware, network, and cache classification.
5. The current HTTP ingestion contract stores one parameter row per request.
6. Retrieval is pond-scoped and controlled comparisons are within one pond.
7. External model output, availability, price, and latency may change over time.
8. MQTT remains deferred and full ingestion validation must not be claimed until it is executed.
`;

export const generateEvaluationReport = async (
  runId: string
): Promise<EvaluationReportResult> => {
  const files = await artifactStore.listFiles(runId);
  const indicators = buildIndicators(await loadArtifactGroups(runId, files));
  const requiredNonMqttIndicators = indicators.filter(
    ({ id }) => id !== "mqtt-ingestion"
  );
  const result: EvaluationReportResult = {
    artifacts: files,
    generatedAt: new Date().toISOString(),
    indicators,
    initialNonMqttEvaluationComplete: requiredNonMqttIndicators.every(
      ({ status }) => status === "pass"
    ),
    mqttStatus: "not-executed",
    runId,
    schemaVersion: 1,
  };
  await artifactStore.writeJson(
    runId,
    "reports/validation-summary.json",
    result
  );
  await artifactStore.writeText(
    runId,
    "reports/validation-summary.md",
    buildSummaryMarkdown(result)
  );
  await artifactStore.writeText(
    runId,
    "reports/limitations.md",
    LIMITATIONS_MARKDOWN
  );
  return result;
};
