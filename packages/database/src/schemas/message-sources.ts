import {
  index,
  integer,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { analysisResults } from "./analysis-results";
import { messages } from "./messages";

export const messageSources = pgTable(
  "message_sources",
  {
    analysisCreatedAt: timestamp("analysis_created_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    analysisCycleId: integer("analysis_cycle_id"),
    analysisId: integer("analysis_id").references(() => analysisResults.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    id: serial("id").primaryKey(),
    messageRowId: integer("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    periodEnd: timestamp("period_end", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    periodStart: timestamp("period_start", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    rank: integer("rank").notNull(),
    similarity: real("similarity"),
    sourceKey: text("source_key").notNull(),
  },
  (table) => [
    uniqueIndex("message_sources_message_key_unique").on(
      table.messageRowId,
      table.sourceKey
    ),
    index("message_sources_message_idx").on(table.messageRowId),
    index("message_sources_analysis_idx").on(table.analysisId),
  ]
);
