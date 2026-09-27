import { resolve } from "node:path";

export const EVALUATION_ROOT = resolve(import.meta.dir, "../..");
export const REPOSITORY_ROOT = resolve(EVALUATION_ROOT, "../..");
const CONFIG_DIRECTORY = resolve(EVALUATION_ROOT, "config");

export const BUN_LOCK_PATH = resolve(REPOSITORY_ROOT, "bun.lock");
export const ADVISOR_PROMPT_PATH = resolve(
  REPOSITORY_ROOT,
  "apps/analysis/src/modules/chat/advisor/prompt.ts"
);

export const MODEL_CONFIG_PATH = resolve(CONFIG_DIRECTORY, "model.json");
export const RAG_CONTEXT_CATALOG_PATH = resolve(
  CONFIG_DIRECTORY,
  "rag/controlled-contexts.json"
);

export const SCORING_SCENARIO_PATHS = [
  resolve(CONFIG_DIRECTORY, "scenarios/c1-reference.json"),
  resolve(CONFIG_DIRECTORY, "scenarios/c2-moderate.json"),
  resolve(CONFIG_DIRECTORY, "scenarios/c3-25-prolonged.json"),
  resolve(CONFIG_DIRECTORY, "scenarios/c3-50-prolonged.json"),
  resolve(CONFIG_DIRECTORY, "scenarios/c4-critical-event.json"),
  resolve(CONFIG_DIRECTORY, "scenarios/c5-simultaneous.json"),
  resolve(CONFIG_DIRECTORY, "scenarios/c6-a-irregular.json"),
  resolve(CONFIG_DIRECTORY, "scenarios/c6-b-missing.json"),
] as const;

export const INVALID_PAYLOAD_CONFIG_PATH = resolve(
  CONFIG_DIRECTORY,
  "scenarios/c7-invalid.json"
);

export const DATASET_CONFIG_PATHS = [
  resolve(CONFIG_DIRECTORY, "datasets/1-pond-7-days.json"),
  resolve(CONFIG_DIRECTORY, "datasets/1-pond-30-days.json"),
  resolve(CONFIG_DIRECTORY, "datasets/10-ponds-7-days.json"),
  resolve(CONFIG_DIRECTORY, "datasets/10-ponds-30-days.json"),
  resolve(CONFIG_DIRECTORY, "datasets/50-ponds-7-days.json"),
  resolve(CONFIG_DIRECTORY, "datasets/50-ponds-30-days.json"),
] as const;

export const GENERATED_ORACLE_SUMMARY_PATH = resolve(
  CONFIG_DIRECTORY,
  "generated/oracle-summary.json"
);

export const GENERATED_DATASET_SUMMARY_PATH = resolve(
  CONFIG_DIRECTORY,
  "generated/dataset-summary.json"
);
