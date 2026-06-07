import { index, jsonb, pgTable, real, serial, timestamp } from "drizzle-orm/pg-core";

export const analysisResults = pgTable("analysis_results", {
	id: serial("id").primaryKey(),
	pondId: serial("pond_id").notNull(),
	cycleId: serial("cycle_id"),

	startTime: timestamp("start_time").notNull(),
	endTime: timestamp("end_time").notNull(),

	finalScore: real("final_score").notNull(),
	temperatureScore: real("temperature_score").notNull(),
	phScore: real("ph_score").notNull(),
	salinityScore: real("salinity_score").notNull(),
	dissolvedOxygenScore: real("dissolved_oxygen_score").notNull(),
	turbidityScore: real("turbidity_score").notNull(),

	metadata: jsonb("metadata").notNull(),

	createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
		.notNull()
		.defaultNow(),
}, (table) => [
	// Single column indexes
	index("analysis_results_pond_idx").on(table.pondId),
	index("analysis_results_cycle_idx").on(table.cycleId),
	index("analysis_results_start_time_idx").on(table.startTime),
	index("analysis_results_end_time_idx").on(table.endTime),
	index("analysis_results_created_at_idx").on(table.createdAt),
	
	// Score indexes for filtering and sorting
	index("analysis_results_final_score_idx").on(table.finalScore),
	
	// Composite indexes for common query patterns
	index("analysis_results_pond_time_idx").on(table.pondId, table.startTime, table.endTime),
	index("analysis_results_time_range_idx").on(table.startTime, table.endTime),
]);
