import { jsonb, pgTable, real, serial, timestamp } from "drizzle-orm/pg-core";

export const analysisResults = pgTable("analysis_results", {
	id: serial("id").primaryKey(),
	pondId: serial("pond_id").notNull(),

	startTime: timestamp("start_time").notNull(),
	endTime: timestamp("end_time").notNull(),

	finalScore: real("final_score").notNull(),
	phScore: real("ph_score").notNull(),
	salinityScore: real("salinity_score").notNull(),
	dissolvedOxygenScore: real("dissolvedOxygen_score").notNull(),
	turbidityScore: real("turbidity_score").notNull(),

	metadata: jsonb("metadata").notNull(),

	createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
		.notNull()
		.defaultNow(),
});
