import { drizzle } from "drizzle-orm/bun-sql";
import { ENV } from "varlock/env";
import { relations } from "./relations";

export * from "../schemas";

export const db = drizzle(ENV.DATABASE_URL, { relations });
