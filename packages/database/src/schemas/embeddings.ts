import { pgTable, serial, text, timestamp, vector } from "drizzle-orm/pg-core";

// Analysis embeddings table for RAG
// Stores embeddings of analysis results (not raw measurements) to prevent hallucination
export const analysisEmbeddings = pgTable("analysis_embeddings", {
	id: serial("id").primaryKey(),

	// Reference to the pond this analysis belongs to
	pondId: text("pond_id").notNull(),

	// Reference to the analysis result (can be a hash or timestamp)
	analysisId: text("analysis_id").notNull(),

	// The embedded content - structured analysis result summary
	// This contains the analysis context without raw database values
	content: text("content").notNull(),

	// Metadata about the analysis
	metadata: text("metadata").notNull().default("{}"),

	// The embedding vector (1024 dimensions for mistral-embed)
	embedding: vector("embedding", { dimensions: 1024 }).notNull(),

	// Timestamps
	createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
		.notNull()
		.defaultNow(),
});
