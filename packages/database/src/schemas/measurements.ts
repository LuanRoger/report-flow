import {
	numeric,
	pgEnum,
	pgTable,
	serial,
	text,
	timestamp,
	unique,
} from "drizzle-orm/pg-core";
import {
	parameterCodes as parameterCodesArray,
	unitCodes as unitCodesArray,
} from "../constants";

export const parameterCodes = pgEnum("parameter_code", parameterCodesArray);
export const unitCodes = pgEnum("unit_code", unitCodesArray);

export const measurements = pgTable(
	"measurements",
	{
		id: serial("id").primaryKey(),
		pondId: serial("pond_id").notNull(),

		recordedAt: timestamp("recorded_at", {
			withTimezone: true,
			mode: "date",
		}).notNull(),

		parameterCode: parameterCodes("parameter_code").notNull(),
		value: numeric("value", { precision: 12, scale: 4 }).notNull(),
		unit: unitCodes("unit").notNull(),

		sourceType: text("source_type").notNull(),
		sourceFile: text("source_file"),

		createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		unique("measurements_pond_time_idx").on(table.pondId, table.recordedAt),
		unique("measurements_param_time_idx").on(
			table.parameterCode,
			table.recordedAt,
		),
	],
);
