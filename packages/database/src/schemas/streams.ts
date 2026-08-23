import {
  index,
  integer,
  pgTable,
  serial,
  timestamp,
} from "drizzle-orm/pg-core";

export const streams = pgTable(
  "streams",
  {
    chatId: integer("chat_id").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    id: serial("id").primaryKey(),
  },
  (table) => [index("streams_chat_id_idx").on(table.chatId)]
);
