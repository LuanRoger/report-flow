import type z from "zod";
import type {
  analysisDetailsSchema,
  analysisListItemSchema,
  parameterCodeSchema,
} from "@/app/analysis/actions/schemas";

export interface AnalysisChartDatum extends Record<string, unknown> {
  coverage: number;
  parameter: string;
  score: number;
}

export interface ParameterDefinition {
  label: string;
  shortLabel: string;
  unit: string;
}

export type AnalysisDetails = z.infer<typeof analysisDetailsSchema>;
export type AnalysisListItem = z.infer<typeof analysisListItemSchema>;
export type ParameterCode = z.infer<typeof parameterCodeSchema>;
