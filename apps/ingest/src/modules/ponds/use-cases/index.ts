import { createPond as createPondRepository } from "../repository";
import type { CreatePond } from "../repository/types";

export async function createPond(data: CreatePond) {
  return await createPondRepository(data);
}
