import {
	index,
	jsonb,
	pgTable,
	real,
	serial,
	timestamp,
} from "drizzle-orm/pg-core";

export const analysisResults = pgTable(
	"analysis_results",
	{
		createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
			.notNull()
			.defaultNow(),
		cycleId: serial("cycle_id"),
		dissolvedOxygenScore: real("dissolved_oxygen_score").notNull(),
		endTime: timestamp("end_time").notNull(),

		finalScore: real("final_score").notNull(),
		id: serial("id").primaryKey(),

		metadata: jsonb("metadata").notNull(),
		phScore: real("ph_score").notNull(),
		pondId: serial("pond_id").notNull(),
		salinityScore: real("salinity_score").notNull(),

		startTime: timestamp("start_time").notNull(),
		temperatureScore: real("temperature_score").notNull(),
		turbidityScore: real("turbidity_score").notNull(),
	},
	(table) => [
		// Single column indexes
		index("analysis_results_pond_idx").on(table.pondId),
		index("analysis_results_cycle_idx").on(table.cycleId),
		index("analysis_results_start_time_idx").on(table.startTime),
		index("analysis_results_end_time_idx").on(table.endTime),
		index("analysis_results_created_at_idx").on(table.createdAt),

		// Score indexes for filtering and sorting
		index("analysis_results_final_score_idx").on(table.finalScore),

		// Composite indexes for common query patterns
		index("analysis_results_pond_time_idx").on(
			table.pondId,
			table.startTime,
			table.endTime
		),
		index("analysis_results_time_range_idx").on(table.startTime, table.endTime),
	]
);
