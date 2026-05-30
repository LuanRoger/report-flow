import {
	numeric,
	pgEnum,
	pgTable,
	serial,
	text,
	timestamp,
	unique,
} from "drizzle-orm/pg-core";
import { parameterCodes as parameterCodesValues } from "@/models/params";

export const parameterCodes = pgEnum("parameter_code", parameterCodesValues);

export const measurements = pgTable(
	"measurements",
	{
		id: serial("id").primaryKey(),

		farmId: text("farm_id").notNull(),
		pondId: text("pond_id").notNull(),
		cycleId: text("cycle_id").notNull(),

		recordedAt: timestamp("recorded_at", {
			withTimezone: true,
			mode: "date",
		}).notNull(),

		parameterCode: parameterCodes("parameter_code").notNull(),
		value: numeric("value", { precision: 12, scale: 4 }).notNull(),
		unit: text("unit").notNull().default(""),

		sourceType: text("source_type").notNull(),
		sourceFile: text("source_file"),

		createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		unique("measurements_pond_time_idx").on(table.pondId, table.recordedAt),
		unique("measurements_farm_time_idx").on(table.farmId, table.recordedAt),
		unique("measurements_param_time_idx").on(
			table.parameterCode,
			table.recordedAt,
		),
	],
);
