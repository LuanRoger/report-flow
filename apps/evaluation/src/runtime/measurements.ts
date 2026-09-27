import { parseUtcTimestamp, toUtcIsoString } from "../shared/time.ts";
import type {
  DatasetConfig,
  MeasurementRecord,
  ParameterCode,
} from "../shared/types.ts";
import { PARAMETER_CODES } from "../shared/types.ts";
import { readCount, type SqlBinding, type SqlClient } from "./database.ts";

const INSERTED_MEASUREMENT_COLUMNS = [
  "pond_id",
  "cycle_id",
  "recorded_at",
  "parameter_code",
  "value",
  "unit",
  "source_type",
  "source_file",
] as const;
const MAXIMUM_INSERT_BINDINGS = 60_000;

const readFiniteNumber = (value: unknown, path: string): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${path} must be finite`);
  }
  return parsed;
};

const readString = (value: unknown, path: string): string => {
  if (typeof value !== "string" || !value) {
    throw new Error(`${path} must be a nonempty string`);
  }
  return value;
};

const dateOnly = (timestamp: string): string => timestamp.slice(0, 10);

export interface PondCycleDefinition {
  cycleId: number;
  endDate: string;
  pondId: number;
  startDate: string;
}

export const datasetPondCycles = (
  config: DatasetConfig
): PondCycleDefinition[] => {
  const cycles: PondCycleDefinition[] = [];
  let pondIndex = 0;
  while (pondIndex < config.pondCount) {
    let cycleIndex = 0;
    while (cycleIndex < config.cyclesPerPond) {
      cycles.push({
        cycleId: pondIndex * config.cyclesPerPond + cycleIndex + 1,
        endDate: dateOnly(config.end),
        pondId: pondIndex + 1,
        startDate: dateOnly(config.start),
      });
      cycleIndex += 1;
    }
    pondIndex += 1;
  }
  return cycles;
};

export const ensurePondsAndCycles = async (
  client: SqlClient,
  cycles: readonly PondCycleDefinition[]
): Promise<void> => {
  const pondIds = [...new Set(cycles.map(({ pondId }) => pondId))].sort(
    (left, right) => left - right
  );
  await Promise.all(
    pondIds.map((pondId) =>
      client.query(
        "INSERT INTO ponds (id, cycle) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
        [pondId, pondId]
      )
    )
  );

  await Promise.all(
    cycles.map(async (cycle) => {
      await client.query(
        "INSERT INTO pond_cycles (id, pond_id, start_date, end_date) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING",
        [cycle.cycleId, cycle.pondId, cycle.startDate, cycle.endDate]
      );
      const ownership = await client.query<{ pond_id: unknown }>(
        "SELECT pond_id FROM pond_cycles WHERE id = $1",
        [cycle.cycleId]
      );
      const actualPondId = readFiniteNumber(
        ownership[0]?.pond_id,
        `cycle ${cycle.cycleId} pond_id`
      );
      if (actualPondId !== cycle.pondId) {
        throw new Error(
          `Cycle ${cycle.cycleId} belongs to pond ${actualPondId}, expected ${cycle.pondId}`
        );
      }
    })
  );
};

export interface MeasurementInsertStatement {
  bindings: SqlBinding[];
  statement: string;
}

export const buildMeasurementInsert = (
  records: readonly MeasurementRecord[],
  sourceFile: string
): MeasurementInsertStatement => {
  if (records.length === 0) {
    throw new Error("Cannot build an empty measurement insert");
  }
  const bindingCount = records.length * INSERTED_MEASUREMENT_COLUMNS.length;
  if (bindingCount > MAXIMUM_INSERT_BINDINGS) {
    throw new Error(
      `Measurement batch requires ${bindingCount} bindings; maximum is ${MAXIMUM_INSERT_BINDINGS}`
    );
  }

  const bindings: SqlBinding[] = [];
  const rowPlaceholders: string[] = [];
  for (const record of records) {
    const firstBinding = bindings.length + 1;
    rowPlaceholders.push(
      `(${Array.from(
        { length: INSERTED_MEASUREMENT_COLUMNS.length },
        (_, index) => `$${firstBinding + index}`
      ).join(", ")})`
    );
    bindings.push(
      record.pondId,
      record.cycleId,
      record.recordedAt,
      record.parameterCode,
      record.value,
      record.unit,
      record.sourceType,
      sourceFile
    );
  }

  return {
    bindings,
    statement: `INSERT INTO measurements (${INSERTED_MEASUREMENT_COLUMNS.join(", ")}) VALUES ${rowPlaceholders.join(", ")}`,
  };
};

export const maximumSafeMeasurementBatchSize = (): number =>
  Math.floor(MAXIMUM_INSERT_BINDINGS / INSERTED_MEASUREMENT_COLUMNS.length);

export const insertMeasurementBatch = async (
  client: SqlClient,
  records: readonly MeasurementRecord[],
  sourceFile: string
): Promise<void> => {
  const { bindings, statement } = buildMeasurementInsert(records, sourceFile);
  await client.query(statement, bindings);
};

export interface MeasurementWindowCount {
  count: number;
  end: string;
  pondId: number;
  start: string;
}

export const countMeasurementsInWindow = async (
  client: SqlClient,
  pondId: number,
  start: string,
  end: string
): Promise<number> => {
  const rows = await client.query<{ row_count: unknown }>(
    "SELECT COUNT(*) AS row_count FROM measurements WHERE pond_id = $1 AND recorded_at >= $2 AND recorded_at < $3",
    [pondId, start, end]
  );
  return readCount(rows[0]?.row_count, "measurements.rowCount");
};

export const countAllMeasurements = async (
  client: SqlClient
): Promise<number> => {
  const rows = await client.query<{ row_count: unknown }>(
    "SELECT COUNT(*) AS row_count FROM measurements"
  );
  return readCount(rows[0]?.row_count, "measurements.rowCount");
};

export const readMeasurementsInWindow = async (
  client: SqlClient,
  pondId: number,
  start: string,
  end: string
): Promise<MeasurementRecord[]> => {
  const rows = await client.query<{
    cycle_id: unknown;
    parameter_code: unknown;
    pond_id: unknown;
    recorded_at: unknown;
    source_type: unknown;
    unit: unknown;
    value: unknown;
  }>(
    "SELECT pond_id, cycle_id, recorded_at, parameter_code, value, unit, source_type FROM measurements WHERE pond_id = $1 AND recorded_at >= $2 AND recorded_at < $3 ORDER BY recorded_at ASC, parameter_code ASC",
    [pondId, start, end]
  );

  return rows.map((row, index) => {
    const parameterCode = readString(
      row.parameter_code,
      `measurements[${index}].parameterCode`
    );
    if (!PARAMETER_CODES.includes(parameterCode as ParameterCode)) {
      throw new Error(
        `Unsupported parameter code in database: ${parameterCode}`
      );
    }
    const recordedAtValue = row.recorded_at;
    const recordedAt =
      recordedAtValue instanceof Date
        ? recordedAtValue.toISOString()
        : toUtcIsoString(
            parseUtcTimestamp(
              readString(recordedAtValue, `measurements[${index}].recordedAt`),
              `measurements[${index}].recordedAt`
            )
          );

    return {
      cycleId: readFiniteNumber(row.cycle_id, `measurements[${index}].cycleId`),
      parameterCode: parameterCode as ParameterCode,
      pondId: readFiniteNumber(row.pond_id, `measurements[${index}].pondId`),
      recordedAt,
      sourceType: readString(
        row.source_type,
        `measurements[${index}].sourceType`
      ) as MeasurementRecord["sourceType"],
      unit: readString(row.unit, `measurements[${index}].unit`),
      value: readFiniteNumber(row.value, `measurements[${index}].value`),
    };
  });
};

export interface MeasurementIntegrityResult {
  duplicateIdentityCount: number;
  firstRecordedAt: string | null;
  lastRecordedAt: string | null;
  perParameterCount: Record<ParameterCode, number>;
  rowCount: number;
}

export const inspectMeasurementIntegrity = async (
  client: SqlClient
): Promise<MeasurementIntegrityResult> => {
  const [aggregateRows, parameterRows, duplicateRows] = await Promise.all([
    client.query<{
      first_recorded_at: unknown;
      last_recorded_at: unknown;
      row_count: unknown;
    }>(
      "SELECT COUNT(*) AS row_count, MIN(recorded_at) AS first_recorded_at, MAX(recorded_at) AS last_recorded_at FROM measurements"
    ),
    client.query<{ parameter_code: unknown; row_count: unknown }>(
      "SELECT parameter_code, COUNT(*) AS row_count FROM measurements GROUP BY parameter_code ORDER BY parameter_code"
    ),
    client.query<{ duplicate_count: unknown }>(
      "SELECT COUNT(*) AS duplicate_count FROM (SELECT pond_id, parameter_code, recorded_at FROM measurements GROUP BY pond_id, parameter_code, recorded_at HAVING COUNT(*) > 1) AS duplicates"
    ),
  ]);
  const [aggregate] = aggregateRows;
  const perParameterCount: Record<ParameterCode, number> = {
    dissolvedOxygen: 0,
    ph: 0,
    salinity: 0,
    temperature: 0,
  };
  for (const row of parameterRows) {
    const parameterCode = readString(row.parameter_code, "parameterCode");
    if (PARAMETER_CODES.includes(parameterCode as ParameterCode)) {
      perParameterCount[parameterCode as ParameterCode] = readCount(
        row.row_count,
        `${parameterCode}.rowCount`
      );
    }
  }

  const normalizeTimestamp = (value: unknown): string | null => {
    if (value === null || value === undefined) {
      return null;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    return toUtcIsoString(parseUtcTimestamp(String(value), "recordedAt"));
  };

  return {
    duplicateIdentityCount: readCount(
      duplicateRows[0]?.duplicate_count,
      "duplicateIdentityCount"
    ),
    firstRecordedAt: normalizeTimestamp(aggregate?.first_recorded_at),
    lastRecordedAt: normalizeTimestamp(aggregate?.last_recorded_at),
    perParameterCount,
    rowCount: readCount(aggregate?.row_count, "rowCount"),
  };
};
