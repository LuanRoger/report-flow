export type ParameterCode = 'do' | 'ph' | 'temperature' | 'salinity' | 'turbidity';

export const parameterCodes: ParameterCode[] = ['do', 'ph', 'temperature', 'salinity', 'turbidity'] as const;

export const parameterCodeToName: Record<ParameterCode, string> = {
  do: 'Dissolved Oxygen',
  ph: 'pH',
  temperature: 'Temperature',
  salinity: 'Salinity',
  turbidity: 'Turbidity',
} as const;
