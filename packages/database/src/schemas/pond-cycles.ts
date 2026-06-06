import { date, pgTable, serial } from "drizzle-orm/pg-core";

export const pondCycles = pgTable("pond_cycles", {
	id: serial("id").primaryKey(),
	pondId: serial("pondId").notNull(),

	startDate: date("start_date").notNull(),
	endDate: date("end_date"),

	harvestDate: date("harvest_date"),
});
