import type { RealtimeBucketInterval } from "../constants";

export interface MeasurementCursor {
  id: number;
  recordedAt: Date;
}

export interface ListMeasurementsOptions {
  cursor?: MeasurementCursor;
  endDate?: Date;
  limit: number;
  startDate?: Date;
}

export interface RealtimeMeasurementsOptions {
  bucketInterval: RealtimeBucketInterval;
  endDate: Date;
  startDate: Date;
}
