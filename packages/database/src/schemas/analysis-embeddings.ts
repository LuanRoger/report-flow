import {
	index,
	pgTable,
	serial,
	text,
	timestamp,
	vector,
} from "drizzle-orm/pg-core";

export const analysisEmbeddings = pgTable(
	"analysis_embeddings",
	{
		analysisId: serial("analysis_id").notNull(),

		content: text("content").notNull(),

		createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
			.notNull()
			.defaultNow(),
		embedding: vector("embedding", { dimensions: 1024 }).notNull(),
		id: serial("id").primaryKey(),
	},
	(table) => [
		// Standard B-tree indexes for filtering
		// Note: The HNSW vector index is defined in the migration SQL file
		// as DrizzleORM doesn't have direct support for pgvector HNSW indexes
		index("analysis_embeddings_analysis_idx").on(table.analysisId),
		index("analysis_embeddings_created_at_idx").on(table.createdAt),
	]
);
