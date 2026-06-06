import { pgTable, serial, text, timestamp, vector } from "drizzle-orm/pg-core";

export const analysisEmbeddings = pgTable("analysis_embeddings", {
	id: serial("id").primaryKey(),
	analysisId: serial("analysis_id").notNull(),

	content: text("content").notNull(),
	embedding: vector("embedding", { dimensions: 1024 }).notNull(),

	createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
		.notNull()
		.defaultNow(),
});
