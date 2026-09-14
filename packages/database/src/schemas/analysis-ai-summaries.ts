import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { analysisResults } from "./analysis-results";

export const analysisAiSummaries = pgTable("analysis_ai_summaries", {
  analysisId: integer("analysis_id")
    .notNull()
    .unique("analysis_ai_summaries_analysis_id_unique")
    .references(() => analysisResults.id, {
      name: "fk_analysis_ai_summaries_analysis",
      onDelete: "cascade",
    }),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
    .notNull()
    .defaultNow(),
  id: serial("id").primaryKey(),
  summary: text("summary").notNull(),
});
