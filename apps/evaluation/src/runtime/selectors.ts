import type { DatasetConfig, ScoringScenarioConfig } from "../shared/types.ts";

const normalizeScenarioId = (id: string): string => id.trim().toUpperCase();

export const selectScenarios = (
  scenarios: readonly ScoringScenarioConfig[],
  selector: string
): ScoringScenarioConfig[] => {
  if (selector.trim().toLowerCase() === "all") {
    return [...scenarios];
  }

  const requestedIds = selector
    .split(",")
    .map(normalizeScenarioId)
    .filter(Boolean);
  if (requestedIds.length === 0) {
    throw new Error("Scenario selector must not be empty");
  }
  if (new Set(requestedIds).size !== requestedIds.length) {
    throw new Error("Scenario selector contains duplicate IDs");
  }

  const byId = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  return requestedIds.map((id) => {
    const scenario = byId.get(id as ScoringScenarioConfig["id"]);
    if (!scenario) {
      throw new Error(`Unknown scoring scenario: ${id}`);
    }
    return scenario;
  });
};

export const selectDataset = (
  datasets: readonly DatasetConfig[],
  selector: { days?: number; id?: string; ponds?: number }
): DatasetConfig => {
  if (selector.id) {
    const dataset = datasets.find(({ id }) => id === selector.id);
    if (!dataset) {
      throw new Error(`Unknown dataset: ${selector.id}`);
    }
    return dataset;
  }

  if (selector.ponds === undefined || selector.days === undefined) {
    throw new Error(
      "Select a dataset with --dataset or both --ponds and --days"
    );
  }
  const expectedId = `${selector.ponds}-${selector.ponds === 1 ? "pond" : "ponds"}-${selector.days}-days`;
  const dataset = datasets.find(({ id }) => id === expectedId);
  if (!dataset) {
    throw new Error(
      `No tracked dataset matches ${selector.ponds} ponds and ${selector.days} days`
    );
  }
  return dataset;
};
