import { db, pondCycles } from "@/db";
import type { CreateCycle } from "./types";

export async function createCycle(data: CreateCycle) {
  const result = await db.insert(pondCycles).values(data).returning();
  if (result.length === 0) {
    throw new Error("Failed to create cycle");
  }

  return result[0];
}
