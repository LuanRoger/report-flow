import { createInsertSchema, ponds } from "database";
import type z from "zod";

export const createPondSchema = createInsertSchema(ponds).omit({ id: true });

export type CreatePond = z.infer<typeof createPondSchema>;
