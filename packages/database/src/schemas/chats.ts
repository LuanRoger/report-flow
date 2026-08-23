import { index, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const chats = pgTable(
	"chats",
	{
		createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
			.notNull()
			.defaultNow(),
		id: serial("id").primaryKey(),
		title: text("title").notNull(),
		userId: serial("user_id").notNull(),
	},
	(table) => [
		index("chats_user_id_idx").on(table.userId),
		index("chats_created_at_idx").on(table.createdAt),
	]
);
