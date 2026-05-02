import {
	index,
	numeric,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

export const parameterCodes = pgEnum("parameter_code", [
	"temperature",
	"ph",
	"salinity",
	"turbidity",
	"dissolved_oxygen",
	"ammonia",
	"nitrate",
	"nitrite",
]);

export const measurements = pgTable(
	"measurements",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),

		farmId: text("farm_id").notNull(),
		pondId: text("pond_id").notNull(),
		cycleId: text("cycle_id").notNull(),

		recordedAt: timestamp("recorded_at", {
			withTimezone: true,
			mode: "date",
		}).notNull(),

		parameterCode: parameterCodes().notNull(),
		value: numeric("value", { precision: 12, scale: 4 }).notNull(),
		unit: text("unit").notNull().default(""),

		sourceType: text("source_type").notNull(),
		sourceFile: text("source_file"),

		createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
			.notNull()
			.defaultNow(),
	},
	(table) => ({
		pondTimeIdx: index("measurements_pond_time_idx").on(
			table.pondId,
			table.recordedAt,
		),
		farmTimeIdx: index("measurements_farm_time_idx").on(
			table.farmId,
			table.recordedAt,
		),
		paramTimeIdx: index("measurements_param_time_idx").on(
			table.parameterCode,
			table.recordedAt,
		),
	}),
);
