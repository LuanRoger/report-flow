import { defineRelations } from "drizzle-orm";
import { schemas } from "./schemas";

export const relations = defineRelations(schemas);
