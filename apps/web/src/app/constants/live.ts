export const POLLING_INTERVAL_MS = 15_000;
export const WINDOW_SECONDS = {
  "1h": 60 * 60,
  "6h": 6 * 60 * 60,
  "15m": 15 * 60,
  "24h": 24 * 60 * 60,
} as const;
export const liveParameterCodes = [
  "temperature",
  "turbidity",
  "dissolvedOxygen",
] as const;
export const liveBuckets = ["15s", "1m", "5m", "15m"] as const;
export const liveWindows = ["15m", "1h", "6h", "24h"] as const;
export const metricDefinitions = [
  {
    code: "temperature",
    description: "Average water temperature",
    fractionDigits: 2,
    title: "Temperature",
    unit: "°C",
  },
  {
    code: "turbidity",
    description: "Average suspended-particle reading",
    fractionDigits: 1,
    title: "Turbidity",
    unit: "NTU",
  },
  {
    code: "dissolvedOxygen",
    description: "Average dissolved oxygen concentration",
    fractionDigits: 2,
    title: "Dissolved oxygen",
    unit: "mg/L",
  },
] as const;
