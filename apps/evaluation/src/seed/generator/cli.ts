import { resolve } from "node:path";
import { loadDatasetConfig, loadModelConfig } from "../../shared/config.ts";
import { stablePrettyJson } from "../../shared/json.ts";
import { MODEL_CONFIG_PATH } from "../../shared/paths.ts";
import { generateSeedFile } from "./file.ts";

interface CliOptions {
  configPath: string;
  modelPath: string;
  outputPath: string;
}

const parseArguments = (arguments_: readonly string[]): CliOptions => {
  const options = new Map<string, string>();
  let pendingOption: string | undefined;

  for (const argument of arguments_) {
    if (argument.startsWith("--")) {
      if (pendingOption !== undefined) {
        throw new Error(`${pendingOption} requires a value`);
      }
      if (!["--config", "--model", "--output"].includes(argument)) {
        throw new Error(`Unknown option: ${argument}`);
      }
      if (options.has(argument)) {
        throw new Error(`Duplicate option: ${argument}`);
      }
      pendingOption = argument;
      continue;
    }
    if (pendingOption === undefined) {
      throw new Error(`Unexpected argument: ${argument}`);
    }
    options.set(pendingOption, argument);
    pendingOption = undefined;
  }
  if (pendingOption !== undefined) {
    throw new Error(`${pendingOption} requires a value`);
  }

  const configPath = options.get("--config");
  const outputPath = options.get("--output");
  if (configPath === undefined || outputPath === undefined) {
    throw new Error(
      "Usage: bun run seed:generate --config <dataset-json> --output <fixture.ndjson> [--model <model-json>]"
    );
  }

  return {
    configPath: resolve(configPath),
    modelPath: resolve(options.get("--model") ?? MODEL_CONFIG_PATH),
    outputPath: resolve(outputPath),
  };
};

const main = async (): Promise<void> => {
  const options = parseArguments(process.argv.slice(2));
  const [config, model] = await Promise.all([
    loadDatasetConfig(options.configPath),
    loadModelConfig(options.modelPath),
  ]);
  const summary = await generateSeedFile(config, model, options.outputPath);
  process.stdout.write(stablePrettyJson(summary));
};

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Seed generation failed: ${message}\n`);
  process.exitCode = 1;
}
