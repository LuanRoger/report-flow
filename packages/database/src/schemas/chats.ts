import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { ponds } from "./ponds";

export const chats = pgTable(
  "chats",
  {
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    id: serial("id").primaryKey(),
    pondId: integer("pond_id")
      .notNull()
      .references(() => ponds.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("chats_pond_id_unique").on(table.pondId),
    index("chats_created_at_idx").on(table.createdAt),
    index("chats_updated_at_idx").on(table.updatedAt),
  ]
);
