import { artifactStore } from "../runtime/artifacts.ts";
import {
  type SqlClient,
  type SqlRow,
  toSerializableSqlValue,
  withSqlClient,
} from "../runtime/database.ts";
import { redactSecrets, sanitizeDatabaseUrl } from "../runtime/environment.ts";
import {
  type BenchmarkWindow,
  readMeasurementBounds,
  resolveBenchmarkWindow,
} from "./windows.ts";

interface PlanNodeSummary {
  actualLoops: number | null;
  actualRows: number | null;
  indexName: string | null;
  nodeType: string | null;
  relationName: string | null;
  sharedHitBlocks: number | null;
  sharedReadBlocks: number | null;
  sortMethod: string | null;
  tempReadBlocks: number | null;
  tempWrittenBlocks: number | null;
}

interface QueryPlanArtifact {
  extracted: {
    executionTimeMs: number | null;
    indexesUsed: string[];
    nodes: PlanNodeSummary[];
    planningTimeMs: number | null;
    relationsAccessed: string[];
  };
  fullPlan: unknown;
  pondId: number;
  window: BenchmarkWindow;
}

interface CapturedQuery {
  error: string | null;
  rows: SqlRow[];
}

export interface QueryPlanOptions {
  databaseUrl: string;
  end?: string;
  pondId: number;
  runId: string;
  windowsInDays: readonly number[];
}

export interface QueryPlanResult {
  databaseMetadata: Record<string, CapturedQuery>;
  databaseTarget: ReturnType<typeof sanitizeDatabaseUrl>;
  endedAt: string;
  passed: boolean;
  plans: QueryPlanArtifact[];
  schemaVersion: 1;
  startedAt: string;
}

const readOptionalNumber = (value: unknown): number | null => {
  if (value === undefined || value === null) {
    return null;
  }
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
};

const readOptionalString = (value: unknown): string | null =>
  typeof value === "string" && value ? value : null;

const walkPlanNodes = (value: unknown, nodes: PlanNodeSummary[]): void => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return;
  }
  const record = value as Record<string, unknown>;
  if (typeof record["Node Type"] === "string") {
    nodes.push({
      actualLoops: readOptionalNumber(record["Actual Loops"]),
      actualRows: readOptionalNumber(record["Actual Rows"]),
      indexName: readOptionalString(record["Index Name"]),
      nodeType: readOptionalString(record["Node Type"]),
      relationName: readOptionalString(record["Relation Name"]),
      sharedHitBlocks: readOptionalNumber(record["Shared Hit Blocks"]),
      sharedReadBlocks: readOptionalNumber(record["Shared Read Blocks"]),
      sortMethod: readOptionalString(record["Sort Method"]),
      tempReadBlocks: readOptionalNumber(record["Temp Read Blocks"]),
      tempWrittenBlocks: readOptionalNumber(record["Temp Written Blocks"]),
    });
  }
  for (const entry of Object.values(record)) {
    if (Array.isArray(entry)) {
      for (const child of entry) {
        walkPlanNodes(child, nodes);
      }
    } else {
      walkPlanNodes(entry, nodes);
    }
  }
};

const extractPlan = (fullPlan: unknown): QueryPlanArtifact["extracted"] => {
  const rootEntry = Array.isArray(fullPlan) ? fullPlan[0] : fullPlan;
  const root =
    rootEntry !== null &&
    typeof rootEntry === "object" &&
    !Array.isArray(rootEntry)
      ? (rootEntry as Record<string, unknown>)
      : {};
  const nodes: PlanNodeSummary[] = [];
  walkPlanNodes(root.Plan, nodes);
  return {
    executionTimeMs: readOptionalNumber(root["Execution Time"]),
    indexesUsed: [
      ...new Set(
        nodes.flatMap(({ indexName }) => (indexName ? [indexName] : []))
      ),
    ].sort(),
    nodes,
    planningTimeMs: readOptionalNumber(root["Planning Time"]),
    relationsAccessed: [
      ...new Set(
        nodes.flatMap(({ relationName }) =>
          relationName ? [relationName] : []
        )
      ),
    ].sort(),
  };
};

const unwrapExplainPlan = (rows: readonly SqlRow[]): unknown => {
  const [row] = rows;
  if (!row) {
    throw new Error("EXPLAIN returned no rows");
  }
  return row["QUERY PLAN"] ?? row["query plan"] ?? Object.values(row)[0];
};

const captureOptionalQuery = async (
  client: SqlClient,
  statement: string
): Promise<CapturedQuery> => {
  try {
    const rows = await client.query(statement);
    return {
      error: null,
      rows: toSerializableSqlValue(rows) as SqlRow[],
    };
  } catch (error) {
    return {
      error: redactSecrets(
        error instanceof Error ? error.message : String(error)
      ),
      rows: [],
    };
  }
};

const captureDatabaseMetadata = async (
  client: SqlClient
): Promise<Record<string, CapturedQuery>> => ({
  chunks: await captureOptionalQuery(
    client,
    "SELECT hypertable_schema, hypertable_name, chunk_schema, chunk_name, range_start, range_end, is_compressed FROM timescaledb_information.chunks WHERE hypertable_schema = 'public' AND hypertable_name = 'measurements' ORDER BY range_start"
  ),
  continuousAggregates: await captureOptionalQuery(
    client,
    "SELECT * FROM timescaledb_information.continuous_aggregates ORDER BY view_schema, view_name"
  ),
  dimensions: await captureOptionalQuery(
    client,
    "SELECT * FROM timescaledb_information.dimensions WHERE hypertable_schema = 'public' AND hypertable_name = 'measurements' ORDER BY dimension_number"
  ),
  hypertable: await captureOptionalQuery(
    client,
    "SELECT * FROM timescaledb_information.hypertables WHERE hypertable_schema = 'public' AND hypertable_name = 'measurements'"
  ),
  jobs: await captureOptionalQuery(
    client,
    "SELECT job_id, application_name, schedule_interval, max_runtime, max_retries, retry_period, proc_schema, proc_name, scheduled FROM timescaledb_information.jobs ORDER BY job_id"
  ),
  sizes: await captureOptionalQuery(
    client,
    "SELECT pg_size_pretty(pg_total_relation_size('measurements')) AS total_size, pg_size_pretty(pg_relation_size('measurements')) AS table_size, pg_size_pretty(pg_indexes_size('measurements')) AS indexes_size"
  ),
});

export const captureQueryPlans = async (
  options: QueryPlanOptions
): Promise<QueryPlanResult> => {
  const startedAt = new Date().toISOString();
  const databaseTarget = sanitizeDatabaseUrl(options.databaseUrl);
  await artifactStore.requireRun(options.runId);

  const execution = await withSqlClient(options.databaseUrl, async (client) => {
    const bounds = await readMeasurementBounds(client, options.pondId);
    const plans: QueryPlanArtifact[] = [];
    for (const days of options.windowsInDays) {
      const window = resolveBenchmarkWindow(bounds, days, options.end);
      // biome-ignore lint/performance/noAwaitInLoops: Plans run serially to avoid cross-query contention changing the observations.
      const rows = await client.query(
        "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id, pond_id, cycle_id, recorded_at, parameter_code, value, unit, source_type, source_file, created_at FROM measurements WHERE pond_id = $1 AND recorded_at >= $2 AND recorded_at < $3 ORDER BY recorded_at ASC",
        [options.pondId, window.start, window.end]
      );
      const fullPlan = toSerializableSqlValue(unwrapExplainPlan(rows));
      const artifact: QueryPlanArtifact = {
        extracted: extractPlan(fullPlan),
        fullPlan,
        pondId: options.pondId,
        window,
      };
      plans.push(artifact);
      await artifactStore.writeJson(
        options.runId,
        `performance/query-plans/pond-${options.pondId}-${days}d.json`,
        artifact
      );
    }
    return {
      databaseMetadata: await captureDatabaseMetadata(client),
      plans,
    };
  });

  const result: QueryPlanResult = {
    databaseMetadata: execution.databaseMetadata,
    databaseTarget,
    endedAt: new Date().toISOString(),
    passed: execution.plans.every(
      ({ extracted }) => extracted.executionTimeMs !== null
    ),
    plans: execution.plans,
    schemaVersion: 1,
    startedAt,
  };
  await artifactStore.writeJson(
    options.runId,
    `performance/query-plans/summary-${options.windowsInDays.join("-")}d.json`,
    result
  );
  return result;
};
