import { pgTable, serial } from "drizzle-orm/pg-core";

export const ponds = pgTable("ponds", {
	id: serial("id").primaryKey(),
	cycle: serial("cycle"),
});
