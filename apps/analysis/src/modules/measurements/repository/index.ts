import { db, measurements, pondCycles, ponds } from "database";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  lt,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import {
  REALTIME_MEASUREMENT_PARAMETERS,
  type RealtimeMeasurementParameter,
} from "../constants";
import type {
  ListMeasurementsOptions,
  RealtimeMeasurementsOptions,
} from "./types";

function getMeasurementConditions(
  scopeCondition: SQL,
  options: ListMeasurementsOptions
): SQL[] {
  const conditions = [scopeCondition];

  if (options.startDate) {
    conditions.push(gte(measurements.recordedAt, options.startDate));
  }
  if (options.endDate) {
    conditions.push(lte(measurements.recordedAt, options.endDate));
  }
  if (options.cursor) {
    const cursorCondition = or(
      lt(measurements.recordedAt, options.cursor.recordedAt),
      and(
        eq(measurements.recordedAt, options.cursor.recordedAt),
        lt(measurements.id, options.cursor.id)
      )
    );

    if (cursorCondition) {
      conditions.push(cursorCondition);
    }
  }

  return conditions;
}

async function listMeasurements(
  scopeCondition: SQL,
  options: ListMeasurementsOptions
) {
  const conditions = getMeasurementConditions(scopeCondition, options);

  return await db
    .select()
    .from(measurements)
    .where(and(...conditions))
    .orderBy(desc(measurements.recordedAt), desc(measurements.id))
    .limit(options.limit);
}

export async function pondExists(pondId: number): Promise<boolean> {
  const result = await db
    .select({ id: ponds.id })
    .from(ponds)
    .where(eq(ponds.id, pondId))
    .limit(1);

  return result.length > 0;
}

export async function cycleExists(cycleId: number): Promise<boolean> {
  const result = await db
    .select({ id: pondCycles.id })
    .from(pondCycles)
    .where(eq(pondCycles.id, cycleId))
    .limit(1);

  return result.length > 0;
}

export async function listMeasurementsByPond(
  pondId: number,
  options: ListMeasurementsOptions
) {
  return await listMeasurements(eq(measurements.pondId, pondId), options);
}

export async function listMeasurementsByCycle(
  cycleId: number,
  options: ListMeasurementsOptions
) {
  return await listMeasurements(eq(measurements.cycleId, cycleId), options);
}

export async function getRealtimeMeasurementsForPond(
  pondId: number,
  options: RealtimeMeasurementsOptions
) {
  const bucketStart = sql<Date>`time_bucket(
    ${options.bucketInterval}::interval,
    ${measurements.recordedAt}
  )`.mapWith(measurements.recordedAt);

  return await db
    .select({
      averageValue: sql<number>`avg(${measurements.value})`.mapWith(Number),
      bucketStart,
      lastValue:
        sql<number>`last(${measurements.value}, ${measurements.recordedAt})`.mapWith(
          Number
        ),
      maximumValue: sql<number>`max(${measurements.value})`.mapWith(Number),
      minimumValue: sql<number>`min(${measurements.value})`.mapWith(Number),
      parameterCode: sql<RealtimeMeasurementParameter>`${measurements.parameterCode}`,
      sampleCount: sql<number>`count(*)::integer`.mapWith(Number),
      unit: measurements.unit,
    })
    .from(measurements)
    .where(
      and(
        eq(measurements.pondId, pondId),
        inArray(measurements.parameterCode, REALTIME_MEASUREMENT_PARAMETERS),
        gte(measurements.recordedAt, options.startDate),
        lte(measurements.recordedAt, options.endDate)
      )
    )
    .groupBy(bucketStart, measurements.parameterCode, measurements.unit)
    .orderBy(asc(bucketStart), asc(measurements.parameterCode));
}
