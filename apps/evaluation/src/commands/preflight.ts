import { artifactStore } from "../runtime/artifacts.ts";
import {
  type DatabaseInspection,
  inspectDatabase,
  withSqlClient,
} from "../runtime/database.ts";
import {
  redactSecrets,
  requireEvaluationDatabaseUrl,
  sanitizeDatabaseUrl,
  sanitizeHttpBaseUrl,
} from "../runtime/environment.ts";
import {
  buildEnvironmentManifest,
  type RunClass,
} from "../runtime/manifest.ts";

export interface PreflightCommandOptions {
  analysisApiUrl: string;
  checkServices: boolean;
  databaseUrl: string;
  ingestApiUrl: string;
  runClass: RunClass;
  runId: string;
}

interface ServiceProbe {
  durationMs: number;
  error: string | null;
  executed: boolean;
  reachable: boolean | null;
  status: number | null;
  target: ReturnType<typeof sanitizeHttpBaseUrl>;
}

export interface PreflightResult {
  databaseInspection: DatabaseInspection | null;
  databaseInspectionError: string | null;
  passed: boolean;
  runClass: RunClass;
  runId: string;
  schemaVersion: 1;
  serviceChecks: {
    analysis: ServiceProbe;
    ingest: ServiceProbe;
    passed: boolean;
  };
}

const probeService = async (
  target: ReturnType<typeof sanitizeHttpBaseUrl>,
  execute: boolean
): Promise<ServiceProbe> => {
  if (!execute) {
    return {
      durationMs: 0,
      error: null,
      executed: false,
      reachable: null,
      status: null,
      target,
    };
  }

  const startedAt = performance.now();
  try {
    const response = await fetch(target.baseUrl, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    await response.body?.cancel();
    return {
      durationMs: performance.now() - startedAt,
      error: null,
      executed: true,
      reachable: true,
      status: response.status,
      target,
    };
  } catch (error) {
    return {
      durationMs: performance.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      executed: true,
      reachable: false,
      status: null,
      target,
    };
  }
};

export const runPreflight = async (
  options: PreflightCommandOptions
): Promise<PreflightResult> => {
  const startedAt = new Date().toISOString();
  const databaseTarget = sanitizeDatabaseUrl(options.databaseUrl);
  const ingestTarget = sanitizeHttpBaseUrl(options.ingestApiUrl);
  const analysisTarget = sanitizeHttpBaseUrl(options.analysisApiUrl);
  if (options.runClass === "official" && !options.checkServices) {
    throw new Error(
      "Official preflight cannot skip service reachability checks"
    );
  }
  const [analysisService, ingestService] = await Promise.all([
    probeService(analysisTarget, options.checkServices),
    probeService(ingestTarget, options.checkServices),
  ]);
  const serviceChecks = {
    analysis: analysisService,
    ingest: ingestService,
    passed:
      !options.checkServices ||
      (analysisService.reachable === true && ingestService.reachable === true),
  };
  let databaseInspection: DatabaseInspection | null = null;
  let databaseInspectionError: string | null = null;

  try {
    databaseInspection = await withSqlClient(
      options.databaseUrl,
      async (client) => await inspectDatabase(client, options.databaseUrl)
    );
  } catch (error) {
    databaseInspectionError = redactSecrets(
      error instanceof Error ? error.message : String(error)
    );
  }

  const manifest = await buildEnvironmentManifest({
    analysisTarget,
    databaseInspection,
    databaseInspectionError,
    databaseTarget,
    ingestTarget,
    runClass: options.runClass,
    runId: options.runId,
    serviceChecks,
    serviceChecksPassed: serviceChecks.passed,
    startedAt,
  });
  await artifactStore.initializeRun(options.runId);
  await artifactStore.writeJson(options.runId, "manifest.json", manifest);

  const result: PreflightResult = {
    databaseInspection,
    databaseInspectionError,
    passed: manifest.status === "preflight-passed",
    runClass: options.runClass,
    runId: options.runId,
    schemaVersion: 1,
    serviceChecks,
  };
  await artifactStore.writeJson(options.runId, "preflight.json", result);
  return result;
};

export const preflightOptionsFromEnvironment = (
  runId: string,
  runClass: RunClass,
  checkServices: boolean
): PreflightCommandOptions => ({
  analysisApiUrl:
    process.env.ANALYSIS_API_URL?.trim() || "http://localhost:3001",
  checkServices,
  databaseUrl: requireEvaluationDatabaseUrl(),
  ingestApiUrl: process.env.INGEST_API_URL?.trim() || "http://localhost:3000",
  runClass,
  runId,
});
