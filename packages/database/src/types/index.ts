export type ParameterCode =
  | "temperature"
  | "ph"
  | "salinity"
  | "turbidity"
  | "dissolvedOxygen";

export type UnitCodes = "°C" | "pH" | "ppt" | "NTU" | "mg/L";

export type PersistedMessagePart = Record<string, unknown> & {
  type: string;
};
