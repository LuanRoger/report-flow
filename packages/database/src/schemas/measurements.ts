import {
	index,
	pgEnum,
	pgTable,
	real,
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
		createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
			.notNull()
			.defaultNow(),
		cycleId: serial("cycle_id").notNull(),
		id: serial("id").primaryKey(),

		parameterCode: parameterCodes("parameter_code").notNull(),
		pondId: serial("pond_id").notNull(),

		recordedAt: timestamp("recorded_at", {
			mode: "date",
			withTimezone: true,
		}).notNull(),
		sourceFile: text("source_file"),

		sourceType: text("source_type").notNull(),
		unit: unitCodes("unit").notNull(),
		value: real("value").notNull(),
	},
	(table) => [
		// Unique constraints
		unique("measurements_pond_time_idx").on(table.pondId, table.recordedAt),
		unique("measurements_param_time_idx").on(
			table.parameterCode,
			table.recordedAt
		),

		// Indexes for performance
		index("measurements_pond_idx").on(table.pondId),
		index("measurements_parameter_idx").on(table.parameterCode),
		index("measurements_source_type_idx").on(table.sourceType),
		index("measurements_created_at_idx").on(table.createdAt),

		// Composite indexes for common query patterns
		index("measurements_pond_parameter_idx").on(
			table.pondId,
			table.parameterCode
		),
		index("measurements_pond_recorded_at_idx").on(
			table.pondId,
			table.recordedAt
		),
		index("measurements_parameter_recorded_at_idx").on(
			table.parameterCode,
			table.recordedAt
		),
	]
);
