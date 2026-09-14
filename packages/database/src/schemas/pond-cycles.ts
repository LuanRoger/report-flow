import {
  date,
  index,
  integer,
  pgTable,
  serial,
  unique,
} from "drizzle-orm/pg-core";
import { ponds } from "./ponds";

export const pondCycles = pgTable(
  "pond_cycles",
  {
    endDate: date("end_date"),

    harvestDate: date("harvest_date"),
    id: serial("id").primaryKey(),
    pondId: integer("pond_id")
      .notNull()
      .references(() => ponds.id, {
        name: "fk_pond_cycles_pond",
        onDelete: "cascade",
      }),

    startDate: date("start_date").notNull(),
  },
  (table) => [
    unique("pond_cycles_id_pond_id_unique").on(table.id, table.pondId),

    // Single column indexes
    index("pond_cycles_pond_idx").on(table.pondId),
    index("pond_cycles_start_date_idx").on(table.startDate),
    index("pond_cycles_end_date_idx").on(table.endDate),
    index("pond_cycles_harvest_date_idx").on(table.harvestDate),

    // Composite index for date range queries
    index("pond_cycles_date_range_idx").on(
      table.pondId,
      table.startDate,
      table.endDate
    ),
  ]
);
