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
		id: serial("id").primaryKey(),
		analysisId: serial("analysis_id").notNull(),

		content: text("content").notNull(),
		embedding: vector("embedding", { dimensions: 1024 }).notNull(),

		createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		// Standard B-tree indexes for filtering
		// Note: The HNSW vector index is defined in the migration SQL file
		// as DrizzleORM doesn't have direct support for pgvector HNSW indexes
		index("analysis_embeddings_analysis_idx").on(table.analysisId),
		index("analysis_embeddings_created_at_idx").on(table.createdAt),
	],
);
