import { date, index, pgTable, serial } from "drizzle-orm/pg-core";

export const pondCycles = pgTable("pond_cycles", {
	id: serial("id").primaryKey(),
	pondId: serial("pondId").notNull(),

	startDate: date("start_date").notNull(),
	endDate: date("end_date"),

	harvestDate: date("harvest_date"),
}, (table) => [
	// Single column indexes
	index("pond_cycles_pond_idx").on(table.pondId),
	index("pond_cycles_start_date_idx").on(table.startDate),
	index("pond_cycles_end_date_idx").on(table.endDate),
	index("pond_cycles_harvest_date_idx").on(table.harvestDate),
	
	// Composite index for date range queries
	index("pond_cycles_date_range_idx").on(table.pondId, table.startDate, table.endDate),
]);
