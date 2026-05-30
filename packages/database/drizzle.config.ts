import { defineConfig } from "drizzle-kit";
import { ENV } from "varlock";

// This config is used by drizzle-kit for migrations
// Services should use their own config pointing to this package

export default defineConfig({
	dialect: "postgresql",
	schema: "./src/schemas",
	dbCredentials: {
		url: ENV.DATABASE_URL,
	},
});
