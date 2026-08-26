import type z from "zod";
import type {
  measurementsQuerySchema,
  realtimeMeasurementsQuerySchema,
} from ".";

export type MeasurementsQuery = z.infer<typeof measurementsQuerySchema>;
export type RealtimeMeasurementsQuery = z.infer<
  typeof realtimeMeasurementsQuerySchema
>;
