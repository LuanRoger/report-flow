import type z from "zod";
import type {
  liveMeasurementPointSchema,
  liveMeasurementsSnapshotSchema,
} from "./schemas";

export type LiveMeasurementPoint = z.infer<typeof liveMeasurementPointSchema>;
export type LiveMeasurementsSnapshot = z.infer<
  typeof liveMeasurementsSnapshotSchema
>;
