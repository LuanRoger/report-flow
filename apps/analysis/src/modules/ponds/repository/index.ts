import { db, ponds } from "database";

export async function getPonds() {
  return await db.select().from(ponds);
}

export async function getPondCycles(pondId: number) {
  return await db.query.pondCycles.findMany({ where: { pondId } });
}

export async function getCurrentPondCycle(pondId: number) {
  return await db.transaction(async (tx) => {
    const pond = await tx.query.ponds.findFirst({ where: { id: pondId } });
    if (!pond) {
      return null;
    }

    const { cycle: cycleId } = pond;

    const cycle = await tx.query.pondCycles.findFirst({
      where: { id: cycleId },
    });
    return cycle;
  });
}
