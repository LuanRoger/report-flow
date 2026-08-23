import { createInsertSchema, pondCycles } from "database";
import type z from "zod";

export const createCycleSchema = createInsertSchema(pondCycles);

export type CreateCycle = z.infer<typeof createCycleSchema>;
