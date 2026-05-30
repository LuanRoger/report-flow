import { z } from "zod";

// Query parameters for the analysis endpoint
export const analysisQuerySchema = z.object({
  pondId: z.string().min(1, "pondId is required"),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  // Optional: allow predefined time windows
  window: z.enum(["7d", "30d", "90d", "custom"]).optional().default("7d"),
});

export type AnalysisQuery = z.infer<typeof analysisQuerySchema>;

// Response schema
export const pondScoreResultSchema = z.object({
  pondId: z.string(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  finalScore: z.number().min(1).max(100),
  parameterScores: z.object({
    temperature: z.number().min(1).max(100),
    ph: z.number().min(1).max(100),
    salinity: z.number().min(1).max(100),
    dissolvedOxygen: z.number().min(1).max(100),
    turbidity: z.number().min(1).max(100),
  }),
  metadata: z.object({
    criticalThreshold: z.number(),
    aggregationWeights: z.object({
      alpha: z.number(),
      beta: z.number(),
      gamma: z.number(),
    }),
    parameterWeights: z.object({
      temperature: z.number(),
      ph: z.number(),
      salinity: z.number(),
      dissolvedOxygen: z.number(),
      turbidity: z.number(),
    }),
  }),
});

export type PondScoreResult = z.infer<typeof pondScoreResultSchema>;

// Error response schema
export const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  details: z.any().optional(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
