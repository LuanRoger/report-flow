import { defineConfig } from "drizzle-kit";
import { ENV } from "varlock";

// This config points to the database package schemas
export default defineConfig({
	dialect: "postgresql",
	schema: "../../packages/database/src/schemas",
	dbCredentials: {
		url: ENV.DATABASE_URL,
	},
});
