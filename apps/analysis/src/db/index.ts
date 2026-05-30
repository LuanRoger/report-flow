import { drizzle } from "drizzle-orm/bun-sql";
import { ENV } from "varlock/env";

// Import the schemas from ingest app to reuse the same table definitions
export { measurements } from "../../../ingest/src/db/schemas/measurements";

export const db = drizzle(ENV.DATABASE_URL, { relations: {} });
