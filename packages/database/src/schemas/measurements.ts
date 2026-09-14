import {
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  parameterCodes as parameterCodesArray,
  unitCodes as unitCodesArray,
} from "../constants";
import { pondCycles } from "./pond-cycles";
import { ponds } from "./ponds";

export const parameterCodes = pgEnum("parameter_code", parameterCodesArray);
export const unitCodes = pgEnum("unit_code", unitCodesArray);

export const measurements = pgTable(
  "measurements",
  {
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    cycleId: integer("cycle_id").notNull(),
    id: serial("id").notNull(),

    parameterCode: parameterCodes("parameter_code").notNull(),
    pondId: integer("pond_id")
      .notNull()
      .references(() => ponds.id, {
        name: "fk_measurements_pond",
        onDelete: "cascade",
      }),

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
    primaryKey({
      columns: [table.id, table.recordedAt],
      name: "measurements_pkey",
    }),
    uniqueIndex("measurements_pond_parameter_recorded_at_unique").on(
      table.pondId,
      table.parameterCode,
      table.recordedAt
    ),
    foreignKey({
      columns: [table.cycleId, table.pondId],
      foreignColumns: [pondCycles.id, pondCycles.pondId],
      name: "fk_measurements_cycle_pond",
    }).onDelete("cascade"),

    // Indexes for performance
    index("measurements_pond_idx").on(table.pondId),
    index("measurements_cycle_idx").on(table.cycleId),
    index("measurements_parameter_idx").on(table.parameterCode),
    index("measurements_source_type_idx").on(table.sourceType),
    index("measurements_created_at_idx").on(table.createdAt),

    // Composite indexes for common query patterns
    index("measurements_pond_cycle_idx").on(table.pondId, table.cycleId),
    index("measurements_pond_recorded_at_id_idx").on(
      table.pondId,
      table.recordedAt.desc(),
      table.id.desc()
    ),
    index("measurements_cycle_recorded_at_id_idx").on(
      table.cycleId,
      table.recordedAt.desc(),
      table.id.desc()
    ),
    index("measurements_parameter_recorded_at_idx").on(
      table.parameterCode,
      table.recordedAt
    ),
  ]
);
