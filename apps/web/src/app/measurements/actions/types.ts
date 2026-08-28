import type z from "zod";
import type { measurementSchema } from "./schemas";

export type Measurement = z.infer<typeof measurementSchema>;
