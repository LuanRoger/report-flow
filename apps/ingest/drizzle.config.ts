import { defineConfig } from "drizzle-kit";
import { ENV } from "varlock";

export default defineConfig({
	dialect: "postgresql",
	schema: "./src/db/schemas",
	dbCredentials: {
		url: ENV.DATABASE_URL,
	},
});
