import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  loadAllScoringScenarioConfigs,
  loadInvalidPayloadConfig,
  loadModelConfig,
} from "../shared/config.ts";
import { checksumJson, stablePrettyJson } from "../shared/json.ts";
import { GENERATED_ORACLE_SUMMARY_PATH } from "../shared/paths.ts";
import { buildOracleSummary } from "./scenario.ts";

const parseOutputPath = (arguments_: readonly string[]): string => {
  if (arguments_.length === 0) {
    return GENERATED_ORACLE_SUMMARY_PATH;
  }
  const [option, output] = arguments_;
  if (arguments_.length !== 2 || option !== "--output") {
    throw new Error("Usage: bun run oracle:generate [--output <json-path>]");
  }
  if (output === undefined || output.length === 0) {
    throw new Error("--output requires a nonempty path");
  }
  return resolve(output);
};

const main = async (): Promise<void> => {
  const outputPath = parseOutputPath(process.argv.slice(2));
  const [model, scenarios, invalidPayloadConfig] = await Promise.all([
    loadModelConfig(),
    loadAllScoringScenarioConfigs(),
    loadInvalidPayloadConfig(),
  ]);
  const summary = buildOracleSummary(model, scenarios, invalidPayloadConfig);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, stablePrettyJson(summary), "utf8");
  process.stdout.write(
    stablePrettyJson({
      checksum: checksumJson(summary),
      invalidCaseCount: invalidPayloadConfig.cases.length,
      outputPath,
      scenarioCount: scenarios.length,
    })
  );
};

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Oracle generation failed: ${message}\n`);
  process.exitCode = 1;
}
