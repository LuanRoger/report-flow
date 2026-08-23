import { createInsertSchema, measurements } from "database";
import type z from "zod";
import type { createCycleBodySchema } from "../schemas";

export const createMeasurementSchema = createInsertSchema(measurements);

export type CreateMeasurement = z.infer<typeof createMeasurementSchema>;
export type CreateCycle = z.infer<typeof createCycleBodySchema>;
