import { defineConfig } from "drizzle-kit";
import { ENV } from "varlock/env";

export default defineConfig({
	dbCredentials: {
		url: ENV.DATABASE_URL,
	},
	dialect: "postgresql",
	schema: "./src/schemas",
});
