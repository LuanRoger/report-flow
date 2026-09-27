import { buildOracleSummary } from "../oracle/scenario.ts";
import { artifactStore } from "../runtime/artifacts.ts";
import { loadInvalidPayloadConfig, loadModelConfig } from "../shared/config.ts";
import type { ScoringScenarioConfig } from "../shared/types.ts";

const safeLabel = (selector: string): string =>
  selector
    .toLowerCase()
    .replaceAll(",", "-")
    .replaceAll(/[^a-z0-9-]/g, "");

export const writeOracleArtifact = async (
  runId: string,
  scenarios: readonly ScoringScenarioConfig[],
  selector: string
): Promise<Record<string, unknown>> => {
  await artifactStore.requireRun(runId);
  const [model, invalidPayloadConfig] = await Promise.all([
    loadModelConfig(),
    loadInvalidPayloadConfig(),
  ]);
  const summary = buildOracleSummary(model, scenarios, invalidPayloadConfig);
  const result = {
    ...summary,
    generatedAt: new Date().toISOString(),
    passed: true,
    runId,
  };
  await artifactStore.writeJson(
    runId,
    `correctness/oracle-${safeLabel(selector)}.json`,
    result
  );
  return result;
};
