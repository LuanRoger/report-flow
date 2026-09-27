import { captureQueryPlans } from "./benchmark/query-plans.ts";
import { runSequentialBenchmark } from "./benchmark/sequential.ts";
import {
  captureRagAnswers,
  captureRagRetrieval,
} from "./commands/capture-rag.ts";
import { writeOracleArtifact } from "./commands/oracle.ts";
import {
  preflightOptionsFromEnvironment,
  runPreflight,
} from "./commands/preflight.ts";
import { prepareRagCommand } from "./commands/prepare-rag.ts";
import {
  scoreRagAnswerFile,
  scoreRagRetrievalFile,
} from "./commands/rag-score.ts";
import { validateAnalysisScenarios } from "./commands/validate-analysis.ts";
import { validateHttpIngestion } from "./commands/validate-ingestion.ts";
import { generateEvaluationReport } from "./reporting/report.ts";
import {
  assertOnlyArguments,
  getOptionalOption,
  getRequiredOption,
  hasFlag,
  type ParsedArguments,
  parseArguments,
  parsePositiveIntegerOption,
} from "./runtime/arguments.ts";
import {
  redactSecrets,
  requireEnvironmentValue,
  requireEvaluationDatabaseUrl,
} from "./runtime/environment.ts";
import type { RunClass } from "./runtime/manifest.ts";
import { selectDataset, selectScenarios } from "./runtime/selectors.ts";
import { preloadDataset } from "./seed/preload/index.ts";
import {
  loadAllDatasetConfigs,
  loadAllScoringScenarioConfigs,
  loadModelConfig,
} from "./shared/config.ts";

const WINDOW_SUFFIX_PATTERN = /d$/;

const HELP = `Report Flow evaluation CLI

Commands:
  preflight                  Create a run and inspect the environment/database
  oracle                     Write independent expected scenario results
  preload                    Guarded direct database performance preload
  validate:ingestion         Exercise HTTP ingestion and C7
  validate:analysis          Compare HTTP analysis results with the oracle
  benchmark:sequential       Run warm-cache sequential analysis measurements
  benchmark:plans            Capture EXPLAIN ANALYZE and Timescale metadata
  prepare:rag                Reset and prepare the controlled RAG knowledge base
  capture:rag:retrieval      Run and score 120 live retrieval trials
  capture:rag:answers        Run 120 live answers and write a review template
  evaluate:rag:retrieval     Score an existing retrieval capture JSON
  evaluate:rag:answers       Score an existing reviewed answer capture JSON
  report                     Build reports only from existing artifacts

Run every operational command with --run-id <id>. Preflight must run first.
`;

const writeOutput = (value: string): void => {
  process.stdout.write(`${value}\n`);
};

const writeResult = (command: string, passed: boolean | null): void => {
  let status = "completed";
  if (passed !== null) {
    status = passed ? "passed" : "failed";
  }
  writeOutput(JSON.stringify({ command, passed, status }));
  if (passed === false) {
    process.exitCode = 1;
  }
};

const readRunClass = (argumentsValue: ParsedArguments): RunClass => {
  const runClass =
    getOptionalOption(argumentsValue, "run-class") ?? "exploratory";
  if (runClass !== "exploratory" && runClass !== "official") {
    throw new Error("--run-class must be exploratory or official");
  }
  return runClass;
};

const parseWindowDays = (value: string): number[] => {
  const windows = value.split(",").map((part) => {
    const normalized = part
      .trim()
      .toLowerCase()
      .replace(WINDOW_SUFFIX_PATTERN, "");
    const days = Number(normalized);
    if (!Number.isSafeInteger(days) || days <= 0) {
      throw new Error(`Invalid benchmark window: ${part}`);
    }
    return days;
  });
  if (windows.length === 0 || new Set(windows).size !== windows.length) {
    throw new Error("Benchmark windows must be a nonempty unique list");
  }
  return windows;
};

const readBenchmarkWindows = (argumentsValue: ParsedArguments): number[] => {
  const matrix = getOptionalOption(argumentsValue, "matrix");
  const windows = getOptionalOption(argumentsValue, "windows");
  if (matrix && windows) {
    throw new Error("Use --matrix or --windows, not both");
  }
  if (matrix && matrix !== "primary") {
    throw new Error("Only --matrix primary is currently defined");
  }
  return matrix === "primary" || windows === undefined
    ? [7, 30]
    : parseWindowDays(windows);
};

const executePreflight = async (
  argumentsValue: ParsedArguments
): Promise<void> => {
  assertOnlyArguments(argumentsValue, {
    flags: ["skip-service-checks"],
    options: ["run-id", "run-class"],
  });
  const runId = getRequiredOption(argumentsValue, "run-id");
  const result = await runPreflight(
    preflightOptionsFromEnvironment(
      runId,
      readRunClass(argumentsValue),
      !hasFlag(argumentsValue, "skip-service-checks")
    )
  );
  writeResult("preflight", result.passed);
};

const executeOracle = async (
  argumentsValue: ParsedArguments
): Promise<void> => {
  assertOnlyArguments(argumentsValue, { options: ["run-id", "scenarios"] });
  const runId = getRequiredOption(argumentsValue, "run-id");
  const selector = getOptionalOption(argumentsValue, "scenarios") ?? "all";
  const scenarios = selectScenarios(
    await loadAllScoringScenarioConfigs(),
    selector
  );
  await writeOracleArtifact(runId, scenarios, selector);
  writeResult("oracle", true);
};

const executePreload = async (
  argumentsValue: ParsedArguments
): Promise<void> => {
  assertOnlyArguments(argumentsValue, {
    flags: ["confirm-reset"],
    options: ["dataset", "days", "ponds", "run-id"],
  });
  const datasets = await loadAllDatasetConfigs();
  const dataset = selectDataset(datasets, {
    days:
      getOptionalOption(argumentsValue, "days") === undefined
        ? undefined
        : parsePositiveIntegerOption(argumentsValue, "days"),
    id: getOptionalOption(argumentsValue, "dataset"),
    ponds:
      getOptionalOption(argumentsValue, "ponds") === undefined
        ? undefined
        : parsePositiveIntegerOption(argumentsValue, "ponds"),
  });
  const result = await preloadDataset(dataset, await loadModelConfig(), {
    confirmReset: hasFlag(argumentsValue, "confirm-reset"),
    databaseUrl: requireEvaluationDatabaseUrl(),
    runId: getRequiredOption(argumentsValue, "run-id"),
  });
  writeResult("preload", result.passed);
};

const executeIngestionValidation = async (
  argumentsValue: ParsedArguments
): Promise<void> => {
  assertOnlyArguments(argumentsValue, {
    flags: ["allow-remote-target", "skip-c7"],
    options: ["run-id", "scenarios"],
  });
  const selector = getOptionalOption(argumentsValue, "scenarios") ?? "all";
  const scenarios = selectScenarios(
    await loadAllScoringScenarioConfigs(),
    selector
  );
  const includeC7 = !hasFlag(argumentsValue, "skip-c7");
  const result = await validateHttpIngestion(scenarios, includeC7, {
    allowRemoteTarget: hasFlag(argumentsValue, "allow-remote-target"),
    apiKey: requireEnvironmentValue("INGEST_API_KEY"),
    databaseUrl: requireEvaluationDatabaseUrl(),
    ingestApiUrl: process.env.INGEST_API_URL?.trim() || "http://localhost:3000",
    runId: getRequiredOption(argumentsValue, "run-id"),
    selectorLabel: includeC7 ? `${selector}-c7` : selector,
  });
  writeResult("validate:ingestion", result.passed);
};

const executeAnalysisValidation = async (
  argumentsValue: ParsedArguments
): Promise<void> => {
  assertOnlyArguments(argumentsValue, {
    flags: ["allow-remote-target"],
    options: ["run-id", "scenarios"],
  });
  const selector = getOptionalOption(argumentsValue, "scenarios") ?? "all";
  const scenarios = selectScenarios(
    await loadAllScoringScenarioConfigs(),
    selector
  );
  const result = await validateAnalysisScenarios(scenarios, {
    allowRemoteTarget: hasFlag(argumentsValue, "allow-remote-target"),
    analysisApiUrl:
      process.env.ANALYSIS_API_URL?.trim() || "http://localhost:3001",
    apiKey: requireEnvironmentValue("ANALYSIS_API_KEY"),
    databaseUrl: requireEvaluationDatabaseUrl(),
    runId: getRequiredOption(argumentsValue, "run-id"),
    selectorLabel: selector,
  });
  writeResult("validate:analysis", result.passed);
};

const executeSequentialBenchmark = async (
  argumentsValue: ParsedArguments
): Promise<void> => {
  assertOnlyArguments(argumentsValue, {
    flags: ["allow-remote-target"],
    options: [
      "end",
      "matrix",
      "measured-samples",
      "pond-id",
      "run-id",
      "warmup-samples",
      "windows",
    ],
  });
  const result = await runSequentialBenchmark({
    allowRemoteTarget: hasFlag(argumentsValue, "allow-remote-target"),
    analysisApiUrl:
      process.env.ANALYSIS_API_URL?.trim() || "http://localhost:3001",
    apiKey: requireEnvironmentValue("ANALYSIS_API_KEY"),
    databaseUrl: requireEvaluationDatabaseUrl(),
    end: getOptionalOption(argumentsValue, "end"),
    measuredSamples: parsePositiveIntegerOption(
      argumentsValue,
      "measured-samples",
      30
    ),
    pondId: parsePositiveIntegerOption(argumentsValue, "pond-id", 1),
    runId: getRequiredOption(argumentsValue, "run-id"),
    warmupSamples: parsePositiveIntegerOption(
      argumentsValue,
      "warmup-samples",
      5
    ),
    windowsInDays: readBenchmarkWindows(argumentsValue),
  });
  writeResult("benchmark:sequential", result.passed);
};

const executePlanBenchmark = async (
  argumentsValue: ParsedArguments
): Promise<void> => {
  assertOnlyArguments(argumentsValue, {
    options: ["end", "pond-id", "run-id", "windows"],
  });
  const result = await captureQueryPlans({
    databaseUrl: requireEvaluationDatabaseUrl(),
    end: getOptionalOption(argumentsValue, "end"),
    pondId: parsePositiveIntegerOption(argumentsValue, "pond-id", 1),
    runId: getRequiredOption(argumentsValue, "run-id"),
    windowsInDays: parseWindowDays(
      getOptionalOption(argumentsValue, "windows") ?? "7d,30d"
    ),
  });
  writeResult("benchmark:plans", result.passed);
};

const executeRagPreparation = async (
  argumentsValue: ParsedArguments
): Promise<void> => {
  const result = await prepareRagCommand(argumentsValue);
  writeResult("prepare:rag", result.passed);
};

const ragCaptureOptions = (
  argumentsValue: ParsedArguments
): Parameters<typeof captureRagRetrieval>[0] => ({
  allowPaidModels: hasFlag(argumentsValue, "allow-paid-models"),
  allowRemoteTarget: hasFlag(argumentsValue, "allow-remote-target"),
  analysisApiUrl:
    process.env.ANALYSIS_API_URL?.trim() || "http://localhost:3001",
  apiKey: requireEnvironmentValue("ANALYSIS_API_KEY"),
  requestTimeoutMs:
    getOptionalOption(argumentsValue, "request-timeout-ms") === undefined
      ? undefined
      : parsePositiveIntegerOption(argumentsValue, "request-timeout-ms"),
  runId: getRequiredOption(argumentsValue, "run-id"),
});

const assertRagCaptureArguments = (argumentsValue: ParsedArguments): void => {
  assertOnlyArguments(argumentsValue, {
    flags: ["allow-paid-models", "allow-remote-target"],
    options: ["request-timeout-ms", "run-id"],
  });
};

const executeRagRetrievalCapture = async (
  argumentsValue: ParsedArguments
): Promise<void> => {
  assertRagCaptureArguments(argumentsValue);
  const result = await captureRagRetrieval(ragCaptureOptions(argumentsValue));
  writeResult("capture:rag:retrieval", result.score.passed);
};

const executeRagAnswerCapture = async (
  argumentsValue: ParsedArguments
): Promise<void> => {
  assertRagCaptureArguments(argumentsValue);
  const result = await captureRagAnswers(ragCaptureOptions(argumentsValue));
  writeResult("capture:rag:answers", result.failedExecutionCount === 0);
};

const executeRagRetrieval = async (
  argumentsValue: ParsedArguments
): Promise<void> => {
  assertOnlyArguments(argumentsValue, { options: ["input", "run-id"] });
  const result = await scoreRagRetrievalFile(
    getRequiredOption(argumentsValue, "run-id"),
    getRequiredOption(argumentsValue, "input")
  );
  writeResult("evaluate:rag:retrieval", result.passed);
};

const executeRagAnswers = async (
  argumentsValue: ParsedArguments
): Promise<void> => {
  assertOnlyArguments(argumentsValue, { options: ["input", "run-id"] });
  const result = await scoreRagAnswerFile(
    getRequiredOption(argumentsValue, "run-id"),
    getRequiredOption(argumentsValue, "input")
  );
  writeResult("evaluate:rag:answers", result.passed);
};

const executeReport = async (
  argumentsValue: ParsedArguments
): Promise<void> => {
  assertOnlyArguments(argumentsValue, { options: ["run-id"] });
  const result = await generateEvaluationReport(
    getRequiredOption(argumentsValue, "run-id")
  );
  writeResult("report", result.initialNonMqttEvaluationComplete);
};

const COMMANDS: Readonly<
  Record<string, (argumentsValue: ParsedArguments) => Promise<void>>
> = {
  "benchmark:plans": executePlanBenchmark,
  "benchmark:sequential": executeSequentialBenchmark,
  "capture:rag:answers": executeRagAnswerCapture,
  "capture:rag:retrieval": executeRagRetrievalCapture,
  "evaluate:rag:answers": executeRagAnswers,
  "evaluate:rag:retrieval": executeRagRetrieval,
  oracle: executeOracle,
  preflight: executePreflight,
  preload: executePreload,
  "prepare:rag": executeRagPreparation,
  report: executeReport,
  "validate:analysis": executeAnalysisValidation,
  "validate:ingestion": executeIngestionValidation,
};

const main = async (): Promise<void> => {
  const [command, ...rawArguments] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help") {
    writeOutput(HELP);
    return;
  }
  const execute = COMMANDS[command];
  if (!execute) {
    throw new Error(`Unknown evaluation command: ${command}`);
  }
  await execute(parseArguments(rawArguments));
};

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    `Evaluation command failed: ${redactSecrets(message)}\n`
  );
  process.exitCode = 1;
}
