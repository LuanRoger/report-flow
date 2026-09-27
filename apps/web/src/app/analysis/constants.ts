import type { ParameterCode } from "./actions/types";

interface ParameterDefinition {
  label: string;
  shortLabel: string;
  unit: string;
}

export const PARAMETER_CODES = [
  "dissolvedOxygen",
  "temperature",
  "ph",
  "salinity",
] as const satisfies readonly ParameterCode[];

export const PARAMETER_DEFINITIONS: Record<ParameterCode, ParameterDefinition> =
  {
    dissolvedOxygen: {
      label: "Oxigênio dissolvido",
      shortLabel: "Oxigênio",
      unit: "mg/L",
    },
    ph: {
      label: "pH",
      shortLabel: "pH",
      unit: "pH",
    },
    salinity: {
      label: "Salinidade",
      shortLabel: "Salinidade",
      unit: "ppt",
    },
    temperature: {
      label: "Temperatura",
      shortLabel: "Temperatura",
      unit: "°C",
    },
  };
