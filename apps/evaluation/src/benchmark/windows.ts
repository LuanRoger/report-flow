import { readCount, type SqlClient } from "../runtime/database.ts";
import { parseUtcTimestamp, toUtcIsoString } from "../shared/time.ts";

const MILLISECONDS_PER_DAY = 86_400_000;
const DEFAULT_INTERVAL_MILLISECONDS = 300_000;

export interface MeasurementBounds {
  firstRecordedAt: string;
  lastRecordedAt: string;
  pondId: number;
  rowCount: number;
  sourceFiles: string[];
}

const normalizeTimestamp = (value: unknown, path: string): string => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value !== "string") {
    throw new Error(`${path} must be a timestamp`);
  }
  return toUtcIsoString(parseUtcTimestamp(value, path));
};

export const readMeasurementBounds = async (
  client: SqlClient,
  pondId: number
): Promise<MeasurementBounds> => {
  const rows = await client.query<{
    first_recorded_at: unknown;
    last_recorded_at: unknown;
    row_count: unknown;
    source_files: unknown;
  }>(
    "SELECT COUNT(*) AS row_count, MIN(recorded_at) AS first_recorded_at, MAX(recorded_at) AS last_recorded_at, ARRAY_REMOVE(ARRAY_AGG(DISTINCT source_file), NULL) AS source_files FROM measurements WHERE pond_id = $1",
    [pondId]
  );
  const [row] = rows;
  const rowCount = readCount(row?.row_count, "measurementBounds.rowCount");
  if (rowCount === 0) {
    throw new Error(`Pond ${pondId} has no measurements`);
  }
  const sourceFiles = Array.isArray(row?.source_files)
    ? row.source_files.map((value) => String(value)).sort()
    : [];
  return {
    firstRecordedAt: normalizeTimestamp(
      row?.first_recorded_at,
      "measurementBounds.firstRecordedAt"
    ),
    lastRecordedAt: normalizeTimestamp(
      row?.last_recorded_at,
      "measurementBounds.lastRecordedAt"
    ),
    pondId,
    rowCount,
    sourceFiles,
  };
};

export interface BenchmarkWindow {
  days: number;
  end: string;
  start: string;
}

export const resolveBenchmarkWindow = (
  bounds: MeasurementBounds,
  days: number,
  explicitEnd?: string
): BenchmarkWindow => {
  if (!Number.isSafeInteger(days) || days <= 0) {
    throw new Error("Benchmark window days must be a positive integer");
  }
  const endEpoch = explicitEnd
    ? parseUtcTimestamp(explicitEnd, "benchmark.end")
    : parseUtcTimestamp(bounds.lastRecordedAt, "bounds.lastRecordedAt") +
      DEFAULT_INTERVAL_MILLISECONDS;
  const startEpoch = endEpoch - days * MILLISECONDS_PER_DAY;
  const availableStart = parseUtcTimestamp(
    bounds.firstRecordedAt,
    "bounds.firstRecordedAt"
  );
  const availableEnd =
    parseUtcTimestamp(bounds.lastRecordedAt, "bounds.lastRecordedAt") +
    DEFAULT_INTERVAL_MILLISECONDS;
  if (startEpoch < availableStart || endEpoch > availableEnd) {
    throw new Error(
      `${days}-day benchmark window is outside available pond data ${bounds.firstRecordedAt} through ${toUtcIsoString(availableEnd)}`
    );
  }
  return {
    days,
    end: toUtcIsoString(endEpoch),
    start: toUtcIsoString(startEpoch),
  };
};
