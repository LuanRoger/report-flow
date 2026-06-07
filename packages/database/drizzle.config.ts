import { defineConfig } from "drizzle-kit";
import { ENV } from "varlock/env";

export default defineConfig({
	dialect: "postgresql",
	schema: "./src/schemas",
	dbCredentials: {
		url: ENV.DATABASE_URL,
	},
});
