import {
  getCurrentPondCycle as getCurrentPondCycleRepository,
  getPondCycles,
  getPonds as getPondsRepository,
} from "../repository";

export async function getPonds() {
  const ponds = await getPondsRepository();
  return ponds;
}

export async function getCurrentPondCycle(pondId: number) {
  const cycle = await getCurrentPondCycleRepository(pondId);
  return cycle;
}

export async function getPondCycleById(pondId: number) {
  const cycle = await getPondCycles(pondId);
  return cycle;
}
