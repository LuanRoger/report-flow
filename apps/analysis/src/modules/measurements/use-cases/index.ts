import { DateTime } from "luxon";
import z from "zod";
import {
  REALTIME_BUCKET_INTERVALS,
  REALTIME_WINDOW_DURATIONS,
} from "../constants";
import {
  InvalidMeasurementCursorError,
  MeasurementCycleNotFoundError,
  MeasurementPondNotFoundError,
} from "../models/errors";
import {
  cycleExists,
  getRealtimeMeasurementsForPond as getRealtimeMeasurementsForPondRepository,
  listMeasurementsByCycle as listMeasurementsByCycleRepository,
  listMeasurementsByPond as listMeasurementsByPondRepository,
  pondExists,
} from "../repository";
import type { MeasurementCursor } from "../repository/types";
import type {
  MeasurementsQuery,
  RealtimeMeasurementsQuery,
} from "../schemas/types";

const cursorPayloadSchema = z.object({
  id: z.number().int().positive(),
  recordedAt: z.iso.datetime(),
});

function decodeCursor(
  cursor: string | undefined
): MeasurementCursor | undefined {
  if (!cursor) {
    return;
  }

  try {
    const decodedCursor = Buffer.from(cursor, "base64url").toString("utf8");
    const payload = cursorPayloadSchema.parse(JSON.parse(decodedCursor));

    return {
      id: payload.id,
      recordedAt: new Date(payload.recordedAt),
    };
  } catch (error) {
    throw new InvalidMeasurementCursorError(
      "The measurement cursor is invalid",
      { cause: error }
    );
  }
}

function encodeCursor(measurement: { id: number; recordedAt: Date }): string {
  const payload = JSON.stringify({
    id: measurement.id,
    recordedAt: measurement.recordedAt.toISOString(),
  });

  return Buffer.from(payload).toString("base64url");
}

function createMeasurementPage<
  TMeasurement extends { id: number; recordedAt: Date },
>(measurements: TMeasurement[], limit: number) {
  const hasNextPage = measurements.length > limit;
  const items = hasNextPage ? measurements.slice(0, limit) : measurements;
  const lastMeasurement = items.at(-1);

  return {
    items,
    pagination: {
      hasNextPage,
      limit,
      nextCursor:
        hasNextPage && lastMeasurement ? encodeCursor(lastMeasurement) : null,
    },
  };
}

function getRepositoryOptions(query: MeasurementsQuery) {
  return {
    cursor: decodeCursor(query.cursor),
    endDate: query.endDate,
    limit: query.limit + 1,
    startDate: query.startDate,
  };
}

export async function getMeasurementsByPond(
  pondId: number,
  query: MeasurementsQuery
) {
  if (!(await pondExists(pondId))) {
    throw new MeasurementPondNotFoundError(pondId);
  }

  const measurements = await listMeasurementsByPondRepository(
    pondId,
    getRepositoryOptions(query)
  );

  return createMeasurementPage(measurements, query.limit);
}

export async function getMeasurementsByCycle(
  cycleId: number,
  query: MeasurementsQuery
) {
  if (!(await cycleExists(cycleId))) {
    throw new MeasurementCycleNotFoundError(cycleId);
  }

  const measurements = await listMeasurementsByCycleRepository(
    cycleId,
    getRepositoryOptions(query)
  );

  return createMeasurementPage(measurements, query.limit);
}

export async function getRealtimeMeasurementsByPond(
  pondId: number,
  query: RealtimeMeasurementsQuery
) {
  if (!(await pondExists(pondId))) {
    throw new MeasurementPondNotFoundError(pondId);
  }

  const endDate = DateTime.utc();
  const startDate = endDate.minus(REALTIME_WINDOW_DURATIONS[query.window]);
  const items = await getRealtimeMeasurementsForPondRepository(pondId, {
    bucketInterval: REALTIME_BUCKET_INTERVALS[query.bucket],
    endDate: endDate.toJSDate(),
    startDate: startDate.toJSDate(),
  });

  return {
    bucket: query.bucket,
    generatedAt: endDate.toJSDate(),
    items,
    pondId,
    range: {
      endDate: endDate.toJSDate(),
      startDate: startDate.toJSDate(),
    },
    window: query.window,
  };
}
