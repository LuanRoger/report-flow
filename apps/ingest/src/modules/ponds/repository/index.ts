import { db, ponds } from "@/db";
import type { CreatePond } from "./types";

export async function getPondById(pondId: number) {
	return await db.query.ponds.findFirst({
		where: {
			id: pondId,
		},
	});
}

export async function createPond(data: CreatePond) {
	const result = await db.insert(ponds).values(data).returning();
	return result[0];
}
