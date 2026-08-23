import { index, pgTable, serial } from "drizzle-orm/pg-core";

export const ponds = pgTable(
  "ponds",
  {
    cycle: serial("cycle"),
    id: serial("id").primaryKey(),
  },
  (table) => [
    // Index for cycle queries
    index("ponds_cycle_idx").on(table.cycle),
  ]
);
