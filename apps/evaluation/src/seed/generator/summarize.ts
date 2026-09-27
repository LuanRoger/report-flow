import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadAllDatasetConfigs, loadModelConfig } from "../../shared/config.ts";
import { checksumJson, stablePrettyJson } from "../../shared/json.ts";
import { GENERATED_DATASET_SUMMARY_PATH } from "../../shared/paths.ts";
import { buildDatasetPlanSummary } from "./generate.ts";

const parseOutputPath = (arguments_: readonly string[]): string => {
  if (arguments_.length === 0) {
    return GENERATED_DATASET_SUMMARY_PATH;
  }
  const [option, output] = arguments_;
  if (arguments_.length !== 2 || option !== "--output") {
    throw new Error("Usage: bun run seed:summarize [--output <json-path>]");
  }
  if (output === undefined || output.length === 0) {
    throw new Error("--output requires a nonempty path");
  }
  return resolve(output);
};

const main = async (): Promise<void> => {
  const outputPath = parseOutputPath(process.argv.slice(2));
  const [model, configs] = await Promise.all([
    loadModelConfig(),
    loadAllDatasetConfigs(),
  ]);
  const summary = {
    datasets: configs.map((config) => buildDatasetPlanSummary(config, model)),
    generatorVersion: "evaluation-seed-v1",
    modelConfigChecksum: checksumJson(model),
    modelVersion: model.modelVersion,
    schemaVersion: 1,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, stablePrettyJson(summary), "utf8");
  process.stdout.write(
    stablePrettyJson({
      checksum: checksumJson(summary),
      datasetCount: configs.length,
      outputPath,
      totalExpectedRows: configs.reduce(
        (total, config) => total + config.expectedRowCount,
        0
      ),
    })
  );
};

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Dataset summary generation failed: ${message}\n`);
  process.exitCode = 1;
}
