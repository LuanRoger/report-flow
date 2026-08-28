export const REALTIME_MEASUREMENT_PARAMETERS = [
  "temperature",
  "turbidity",
  "dissolvedOxygen",
] as const;

export const REALTIME_BUCKETS = ["15s", "1m", "5m", "15m"] as const;
export const REALTIME_BUCKET_INTERVALS = {
  "1m": "1 minute",
  "5m": "5 minutes",
  "15m": "15 minutes",
  "15s": "15 seconds",
} as const;

export const REALTIME_WINDOWS = ["15m", "1h", "6h", "24h"] as const;
export const REALTIME_WINDOW_DURATIONS = {
  "1h": { hours: 1 },
  "6h": { hours: 6 },
  "15m": { minutes: 15 },
  "24h": { hours: 24 },
} as const;

export type RealtimeBucket = (typeof REALTIME_BUCKETS)[number];
export type RealtimeMeasurementParameter =
  (typeof REALTIME_MEASUREMENT_PARAMETERS)[number];
export type RealtimeBucketInterval =
  (typeof REALTIME_BUCKET_INTERVALS)[RealtimeBucket];
