import { index, pgTable, serial } from "drizzle-orm/pg-core";

export const ponds = pgTable(
	"ponds",
	{
		id: serial("id").primaryKey(),
		cycle: serial("cycle"),
	},
	(table) => [
		// Index for cycle queries
		index("ponds_cycle_idx").on(table.cycle),
	],
);
