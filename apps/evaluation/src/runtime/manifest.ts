import { createHash } from "node:crypto";
import { readFile, statfs } from "node:fs/promises";
import { arch, cpus, freemem, platform, release, totalmem } from "node:os";
import { resolve } from "node:path";
import { spawn } from "bun";
import {
  loadAllDatasetConfigs,
  loadAllScoringScenarioConfigs,
  loadInvalidPayloadConfig,
  loadModelConfig,
} from "../shared/config.ts";
import { checksumJson } from "../shared/json.ts";
import {
  ADVISOR_PROMPT_PATH,
  BUN_LOCK_PATH,
  REPOSITORY_ROOT,
} from "../shared/paths.ts";
import type { DatabaseInspection } from "./database.ts";
import type {
  SanitizedDatabaseTarget,
  SanitizedHttpTarget,
} from "./environment.ts";

export type RunClass = "exploratory" | "official";

interface CommandResult {
  available: boolean;
  exitCode: number | null;
  output: string | null;
}

const executeCommand = async (
  command: string,
  argumentsList: readonly string[]
): Promise<CommandResult> => {
  try {
    const processHandle = spawn([command, ...argumentsList], {
      cwd: REPOSITORY_ROOT,
      stderr: "pipe",
      stdout: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(processHandle.stdout).text(),
      new Response(processHandle.stderr).text(),
      processHandle.exited,
    ]);
    const output = `${stdout}${stderr}`.trim();
    return {
      available: true,
      exitCode,
      output: output || null,
    };
  } catch {
    return { available: false, exitCode: null, output: null };
  }
};

const sha256File = async (path: string): Promise<string> => {
  const bytes = await readFile(path);
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
};

const sha256Text = (value: string): string =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;

const collectGit = async (): Promise<Record<string, unknown>> => {
  const [commit, status, diff] = await Promise.all([
    executeCommand("git", ["--no-pager", "rev-parse", "HEAD"]),
    executeCommand("git", ["--no-optional-locks", "status", "--short"]),
    executeCommand("git", ["--no-pager", "diff", "--binary"]),
  ]);
  const statusOutput = status.output ?? "";

  return {
    commit: commit.exitCode === 0 ? commit.output : null,
    diffHash: diff.exitCode === 0 ? sha256Text(diff.output ?? "") : null,
    dirty: status.exitCode === 0 ? statusOutput.length > 0 : null,
    status:
      status.exitCode === 0 ? statusOutput.split("\n").filter(Boolean) : [],
  };
};

const collectDisk = async (): Promise<Record<string, unknown>> => {
  try {
    const disk = await statfs(REPOSITORY_ROOT, { bigint: true });
    return {
      availableBytes: (disk.bavail * disk.bsize).toString(),
      blockSizeBytes: disk.bsize.toString(),
      capacityBytes: (disk.blocks * disk.bsize).toString(),
      freeBytes: (disk.bfree * disk.bsize).toString(),
      type: "not-detected",
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      type: "not-detected",
    };
  }
};

const detectVirtualization = (): string => {
  if (process.env.WSL_DISTRO_NAME) {
    return `WSL:${process.env.WSL_DISTRO_NAME}`;
  }
  if (process.env.CONTAINER || process.env.KUBERNETES_SERVICE_HOST) {
    return "container-environment-inferred";
  }
  return "not-detected";
};

export interface ManifestInputs {
  analysisTarget: SanitizedHttpTarget;
  databaseInspection: DatabaseInspection | null;
  databaseInspectionError: string | null;
  databaseTarget: SanitizedDatabaseTarget;
  ingestTarget: SanitizedHttpTarget;
  runClass: RunClass;
  runId: string;
  serviceChecks: unknown;
  serviceChecksPassed: boolean;
  startedAt: string;
}

export const buildEnvironmentManifest = async (
  inputs: ManifestInputs
): Promise<Record<string, unknown>> => {
  const [
    model,
    scenarios,
    datasets,
    invalidPayloads,
    git,
    disk,
    k6,
    promptHash,
  ] = await Promise.all([
    loadModelConfig(),
    loadAllScoringScenarioConfigs(),
    loadAllDatasetConfigs(),
    loadInvalidPayloadConfig(),
    collectGit(),
    collectDisk(),
    executeCommand("k6", ["version"]),
    sha256File(ADVISOR_PROMPT_PATH),
  ]);
  const cpuEntries = cpus();
  const completedAt = new Date().toISOString();
  const { dirty } = git;
  const officialRunClean = inputs.runClass !== "official" || dirty === false;
  const databasePassed = inputs.databaseInspection?.passed ?? false;
  const preflightPassed =
    databasePassed && officialRunClean && inputs.serviceChecksPassed;

  return {
    artifacts: {
      immutableStageArtifacts: true,
      manifestMayBeFinalizedByAppendingRecordedEvents: true,
    },
    database: {
      inspectionError: inputs.databaseInspectionError,
      inspectionPassed: databasePassed,
      target: inputs.databaseTarget,
    },
    dependencies: {
      bunLockChecksum: await sha256File(BUN_LOCK_PATH),
      packageManager: "bun@1.4.1",
    },
    endedAt: completedAt,
    evaluationContract: {
      collection: model.collection,
      formulas: model.formulas,
      limitations: model.limitations,
      modelConfigChecksum: checksumJson(model),
      modelVersion: model.modelVersion,
      normalization: model.normalization,
      temporal: model.temporal,
      unfavorableThreshold: model.unfavorableThreshold,
      weights: model.weights,
    },
    events: [],
    generator: {
      datasetConfigChecksums: Object.fromEntries(
        datasets.map((dataset) => [dataset.id, checksumJson(dataset)])
      ),
      scenarioConfigChecksums: Object.fromEntries(
        scenarios.map((scenario) => [scenario.id, checksumJson(scenario)])
      ),
      seedAlgorithm: "park-miller-48271-v1",
      version: "evaluation-seed-v1",
    },
    git,
    host: {
      architecture: arch(),
      cpuModel: cpuEntries[0]?.model ?? "unknown",
      disk,
      logicalCores: cpuEntries.length,
      memoryAvailableBytes: freemem(),
      memoryTotalBytes: totalmem(),
      operatingSystem: platform(),
      operatingSystemRelease: release(),
      physicalCores: null,
      virtualization: detectVirtualization(),
    },
    models: {
      analysisEmbedding: {
        dimensions: 1024,
        model: "text-embedding-3-small",
      },
      analysisSummary: "gpt-4o-mini-2024-07-18",
      conversationalRag: "gpt-5.6-luna",
      ragPromptChecksum: promptHash,
    },
    networkTopology: {
      analysisService: inputs.analysisTarget,
      database: inputs.databaseTarget,
      description:
        "Evaluator-to-service and evaluator-to-database topology; external provider path is runtime dependent",
      ingestService: inputs.ingestTarget,
      serviceChecks: inputs.serviceChecks,
    },
    rag: {
      filters: ["pondId"],
      minimumSimilarity: 0,
      recentResultLimit: 2,
      reranker: null,
      semanticResultLimit: 5,
      similarityMetric: "cosine",
      topK: 5,
    },
    runClass: inputs.runClass,
    runId: inputs.runId,
    schemaVersion: 1,
    sourceFixtures: {
      invalidPayloadConfigChecksum: checksumJson(invalidPayloads),
    },
    startedAt: inputs.startedAt,
    status: preflightPassed ? "preflight-passed" : "preflight-failed",
    timingProfiles: {
      deterministic: {
        embeddingIncluded: false,
        persistenceIncluded: true,
        serializationIncluded: false,
        summaryIncluded: false,
      },
      productionDefault: {
        embeddingIncluded: true,
        persistenceIncluded: true,
        serializationIncluded: false,
        summaryIncluded: true,
      },
    },
    tools: {
      bun: process.versions.bun ?? "unknown",
      k6: k6.available && k6.exitCode === 0 ? k6.output : null,
      resourceCollector: null,
    },
  };
};

export const repositoryPath = (...segments: string[]): string =>
  resolve(REPOSITORY_ROOT, ...segments);
