export type ParameterCode =
  | "temperature"
  | "ph"
  | "salinity"
  | "dissolvedOxygen";

export type UnitCodes = "°C" | "pH" | "ppt" | "mg/L";

export type PersistedMessagePart = Record<string, unknown> & {
  type: string;
};
