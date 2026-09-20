import { db, measurements } from "@/db";
import type { CreateMeasurement } from "./types";

export async function getPondCycle(cycleId: number, pondId: number) {
  return await db.query.pondCycles.findFirst({
    where: {
      id: cycleId,
      pondId,
    },
  });
}

export async function registerMesurement(data: CreateMeasurement) {
  const result = await db.insert(measurements).values(data).returning();
  return result[0];
}
