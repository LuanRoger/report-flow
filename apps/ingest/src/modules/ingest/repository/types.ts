import { createInsertSchema, measurements } from "database";
import type z from "zod";

export const createMeasurementSchema = createInsertSchema(measurements);

export type CreateMeasurement = z.infer<typeof createMeasurementSchema>;
