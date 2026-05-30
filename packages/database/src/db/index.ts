import { drizzle } from "drizzle-orm/bun-sql";
import { relations } from "./relations";

export * from "../schemas";

// biome-ignore lint/style/noNonNullAssertion: varlock secures DATABASE_URL from services
export const db = drizzle(process.env.DATABASE_URL!, { relations });
