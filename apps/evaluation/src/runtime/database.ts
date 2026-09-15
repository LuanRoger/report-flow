import { SQL } from "bun";
import {
  type SanitizedDatabaseTarget,
  sanitizeDatabaseUrl,
} from "./environment.ts";

export type SqlBinding =
  | bigint
  | boolean
  | Date
  | null
  | number
  | string
  | Uint8Array;

export type SqlRow = Record<string, unknown>;

export interface SqlClient {
  close: () => Promise<void>;
  query: <Row extends SqlRow = SqlRow>(
    statement: string,
    bindings?: readonly SqlBinding[]
  ) => Promise<Row[]>;
}

export class BunSqlClient implements SqlClient {
  readonly #database: SQL;

  constructor(databaseUrl: string) {
    this.#database = new SQL(databaseUrl);
  }

  async query<Row extends SqlRow = SqlRow>(
    statement: string,
    bindings: readonly SqlBinding[] = []
  ): Promise<Row[]> {
    const rows = await this.#database.unsafe(statement, [...bindings]);
    return Array.from(rows) as Row[];
  }

  async close(): Promise<void> {
    await this.#database.close();
  }
}

export const createSqlClient = (databaseUrl: string): SqlClient =>
  new BunSqlClient(databaseUrl);

const EXPECTED_EXTENSIONS = ["timescaledb", "vector"] as const;
export const EXPECTED_TABLES = [
  "analysis_ai_summaries",
  "analysis_embeddings",
  "analysis_results",
  "chats",
  "measurements",
  "message_sources",
  "messages",
  "pond_cycles",
  "ponds",
] as const;

interface DatabaseCheck {
  actual: unknown;
  expected: unknown;
  id: string;
  passed: boolean;
}

export interface DatabaseInspection {
  checks: DatabaseCheck[];
  constraints: SqlRow[];
  enumValues: SqlRow[];
  extensions: Array<{ name: string; version: string }>;
  hypertables: SqlRow[];
  indexes: SqlRow[];
  keyTableColumns: SqlRow[];
  measurementsDimensions: SqlRow[];
  passed: boolean;
  rowCounts: Record<string, number | null>;
  server: {
    currentDatabase: string | null;
    version: string | null;
  };
  settings: SqlRow[];
  tables: Array<{ name: string; present: boolean }>;
  target: SanitizedDatabaseTarget;
}

const readString = (value: unknown): string | null => {
  if (typeof value === "string") {
    return value;
  }
  return value === null || value === undefined ? null : String(value);
};

export const readCount = (value: unknown, path: string): number => {
  const count = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`${path} must be a nonnegative safe integer`);
  }
  return count;
};

export const toSerializableSqlValue = (value: unknown): unknown => {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(toSerializableSqlValue);
  }
  if (value !== null && typeof value === "object") {
    const normalized: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      normalized[key] = toSerializableSqlValue(entry);
    }
    return normalized;
  }
  return value;
};

const normalizeRows = (rows: readonly SqlRow[]): SqlRow[] =>
  rows.map((row) => toSerializableSqlValue(row) as SqlRow);

export const inspectDatabase = async (
  client: SqlClient,
  databaseUrl: string
): Promise<DatabaseInspection> => {
  const target = sanitizeDatabaseUrl(databaseUrl);
  const [
    serverRows,
    extensionRows,
    tableRows,
    indexRows,
    hypertableRows,
    settings,
    enumRows,
    columnRows,
    constraintRows,
  ] = await Promise.all([
    client.query<{ current_database: unknown; version: unknown }>(
      "SELECT current_database() AS current_database, version() AS version"
    ),
    client.query<{ extname: unknown; extversion: unknown }>(
      "SELECT extname, extversion FROM pg_extension WHERE extname IN ('timescaledb', 'vector') ORDER BY extname"
    ),
    client.query<{ table_name: unknown }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    ),
    client.query(
      "SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname"
    ),
    client.query(
      "SELECT hypertable_schema, hypertable_name, num_dimensions, num_chunks, compression_enabled FROM timescaledb_information.hypertables ORDER BY hypertable_schema, hypertable_name"
    ),
    client.query(
      "SELECT name, setting, unit, source FROM pg_settings WHERE name IN ('max_connections', 'shared_buffers', 'work_mem', 'maintenance_work_mem', 'effective_cache_size', 'max_parallel_workers', 'max_parallel_workers_per_gather') ORDER BY name"
    ),
    client.query(
      "SELECT enum_type.typname AS enum_name, enum_value.enumlabel AS enum_value, enum_value.enumsortorder AS sort_order FROM pg_type AS enum_type INNER JOIN pg_enum AS enum_value ON enum_type.oid = enum_value.enumtypid WHERE enum_type.typname IN ('parameter_code', 'unit_code') ORDER BY enum_type.typname, enum_value.enumsortorder"
    ),
    client.query(
      "SELECT table_name, column_name, data_type, udt_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('analysis_results', 'analysis_ai_summaries', 'measurements') ORDER BY table_name, ordinal_position"
    ),
    client.query(
      "SELECT relation.relname AS table_name, table_constraint.conname AS constraint_name, pg_get_constraintdef(table_constraint.oid) AS definition FROM pg_constraint AS table_constraint INNER JOIN pg_class AS relation ON relation.oid = table_constraint.conrelid INNER JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace WHERE namespace.nspname = 'public' AND relation.relname IN ('analysis_results', 'analysis_ai_summaries', 'measurements', 'pond_cycles') ORDER BY relation.relname, table_constraint.conname"
    ),
  ]);

  const availableTables = new Set(
    tableRows.map((row) => readString(row.table_name)).filter(Boolean)
  );
  const tables = EXPECTED_TABLES.map((name) => ({
    name,
    present: availableTables.has(name),
  }));
  const extensions = extensionRows.map((row) => ({
    name: readString(row.extname) ?? "unknown",
    version: readString(row.extversion) ?? "unknown",
  }));
  const extensionNames = new Set(extensions.map(({ name }) => name));
  const normalizedIndexRows = normalizeRows(indexRows);
  const normalizedEnumRows = normalizeRows(enumRows);
  const normalizedColumnRows = normalizeRows(columnRows);
  const normalizedConstraintRows = normalizeRows(constraintRows);
  const parameterEnumValues = normalizedEnumRows
    .filter((row) => readString(row.enum_name) === "parameter_code")
    .map((row) => readString(row.enum_value));
  const unitEnumValues = normalizedEnumRows
    .filter((row) => readString(row.enum_name) === "unit_code")
    .map((row) => readString(row.enum_value));
  const analysisResultColumns = new Set(
    normalizedColumnRows
      .filter((row) => readString(row.table_name) === "analysis_results")
      .map((row) => readString(row.column_name))
  );
  const summaryColumns = new Set(
    normalizedColumnRows
      .filter((row) => readString(row.table_name) === "analysis_ai_summaries")
      .map((row) => readString(row.column_name))
  );
  const hasMeasurementIdentityIndex = normalizedIndexRows.some(
    (row) =>
      readString(row.indexname) ===
        "measurements_pond_parameter_recorded_at_unique" &&
      (readString(row.indexdef)?.includes(
        "(pond_id, parameter_code, recorded_at)"
      ) ??
        false)
  );
  const hasCompositeCycleOwnership = normalizedConstraintRows.some(
    (row) => readString(row.constraint_name) === "fk_measurements_cycle_pond"
  );
  const matchesValues = (
    actual: readonly (string | null)[],
    expected: readonly string[]
  ): boolean =>
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
  const hasSeparatedSummary =
    !analysisResultColumns.has("ai_summary") &&
    summaryColumns.has("analysis_id") &&
    summaryColumns.has("summary");
  const hasNoLegacyTurbidity = !(
    parameterEnumValues.includes("turbidity") ||
    unitEnumValues.includes("NTU") ||
    analysisResultColumns.has("turbidity_score")
  );
  const checks: DatabaseCheck[] = [
    ...EXPECTED_EXTENSIONS.map((name) => ({
      actual: extensionNames.has(name),
      expected: true,
      id: `extension:${name}`,
      passed: extensionNames.has(name),
    })),
    ...tables.map(({ name, present }) => ({
      actual: present,
      expected: true,
      id: `table:${name}`,
      passed: present,
    })),
    {
      actual: parameterEnumValues,
      expected: ["temperature", "ph", "salinity", "dissolvedOxygen"],
      id: "enum:parameter_code",
      passed: matchesValues(parameterEnumValues, [
        "temperature",
        "ph",
        "salinity",
        "dissolvedOxygen",
      ]),
    },
    {
      actual: unitEnumValues,
      expected: ["°C", "pH", "ppt", "mg/L"],
      id: "enum:unit_code",
      passed: matchesValues(unitEnumValues, ["°C", "pH", "ppt", "mg/L"]),
    },
    {
      actual: hasMeasurementIdentityIndex,
      expected: true,
      id: "index:measurement-identity",
      passed: hasMeasurementIdentityIndex,
    },
    {
      actual: hasCompositeCycleOwnership,
      expected: true,
      id: "constraint:measurement-cycle-pond-ownership",
      passed: hasCompositeCycleOwnership,
    },
    {
      actual: hasSeparatedSummary,
      expected: true,
      id: "schema:separate-analysis-summary",
      passed: hasSeparatedSummary,
    },
    {
      actual: hasNoLegacyTurbidity,
      expected: true,
      id: "schema:no-legacy-turbidity",
      passed: hasNoLegacyTurbidity,
    },
  ];

  const measurementHypertable = hypertableRows.find(
    (row) => readString(row.hypertable_name) === "measurements"
  );
  checks.push({
    actual: measurementHypertable !== undefined,
    expected: true,
    id: "hypertable:measurements",
    passed: measurementHypertable !== undefined,
  });

  const rowCountEntries = await Promise.all(
    tables.map(async (table): Promise<[string, number | null]> => {
      if (!table.present) {
        return [table.name, null];
      }
      const countRows = await client.query<{ row_count: unknown }>(
        `SELECT COUNT(*) AS row_count FROM ${table.name}`
      );
      return [
        table.name,
        readCount(countRows[0]?.row_count, `${table.name}.rowCount`),
      ];
    })
  );
  const rowCounts = Object.fromEntries(rowCountEntries);

  const measurementsDimensions = measurementHypertable
    ? await client.query(
        "SELECT hypertable_schema, hypertable_name, dimension_number, column_name, column_type, dimension_type, time_interval, integer_interval FROM timescaledb_information.dimensions WHERE hypertable_schema = 'public' AND hypertable_name = 'measurements' ORDER BY dimension_number"
      )
    : [];
  const [serverRow] = serverRows;

  return {
    checks,
    constraints: normalizedConstraintRows,
    enumValues: normalizedEnumRows,
    extensions,
    hypertables: normalizeRows(hypertableRows),
    indexes: normalizedIndexRows,
    keyTableColumns: normalizedColumnRows,
    measurementsDimensions: normalizeRows(measurementsDimensions),
    passed: checks.every(({ passed }) => passed),
    rowCounts,
    server: {
      currentDatabase: readString(serverRow?.current_database),
      version: readString(serverRow?.version),
    },
    settings: normalizeRows(settings),
    tables,
    target,
  };
};

export const withSqlClient = async <Result>(
  databaseUrl: string,
  operation: (client: SqlClient) => Promise<Result>
): Promise<Result> => {
  const client = createSqlClient(databaseUrl);
  try {
    return await operation(client);
  } finally {
    await client.close();
  }
};
