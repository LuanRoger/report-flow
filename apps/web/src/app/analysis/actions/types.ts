import type z from "zod";
import type {
  analysisDetailsSchema,
  analysisListItemSchema,
  parameterCodeSchema,
} from "./schemas";

export type AnalysisDetails = z.infer<typeof analysisDetailsSchema>;
export type AnalysisListItem = z.infer<typeof analysisListItemSchema>;
export type ParameterCode = z.infer<typeof parameterCodeSchema>;
