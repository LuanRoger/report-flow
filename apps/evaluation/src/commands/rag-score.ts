import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseAnswerCapture, scoreAnswerCapture } from "../rag/answers.ts";
import { loadRagGoldCases } from "../rag/gold.ts";
import {
  parseRetrievalCapture,
  scoreRetrievalCapture,
} from "../rag/retrieval.ts";
import { artifactStore } from "../runtime/artifacts.ts";

const JSON_EXTENSION_PATTERN = /\.json$/i;
const UNSAFE_ARTIFACT_CHARACTER_PATTERN = /[^a-z0-9_-]/g;

const readJsonInput = async (path: string): Promise<unknown> => {
  const serialized = await readFile(resolve(path), "utf8");
  return JSON.parse(serialized) as unknown;
};

const safeArtifactLabel = (path: string): string => {
  const filename = path.replaceAll("\\", "/").split("/").at(-1) ?? "capture";
  return filename
    .replace(JSON_EXTENSION_PATTERN, "")
    .toLowerCase()
    .replaceAll(UNSAFE_ARTIFACT_CHARACTER_PATTERN, "-");
};

export const scoreRagRetrievalFile = async (
  runId: string,
  inputPath: string
): Promise<ReturnType<typeof scoreRetrievalCapture>> => {
  await artifactStore.requireRun(runId);
  const [goldCases, input] = await Promise.all([
    loadRagGoldCases(),
    readJsonInput(inputPath),
  ]);
  const result = scoreRetrievalCapture(parseRetrievalCapture(input), goldCases);
  await artifactStore.writeJson(
    runId,
    `rag/retrieval/score-${safeArtifactLabel(inputPath)}.json`,
    result
  );
  return result;
};

export const scoreRagAnswerFile = async (
  runId: string,
  inputPath: string
): Promise<ReturnType<typeof scoreAnswerCapture>> => {
  await artifactStore.requireRun(runId);
  const [goldCases, input] = await Promise.all([
    loadRagGoldCases(),
    readJsonInput(inputPath),
  ]);
  const result = scoreAnswerCapture(parseAnswerCapture(input), goldCases);
  await artifactStore.writeJson(
    runId,
    `rag/answers/score-${safeArtifactLabel(inputPath)}.json`,
    result
  );
  return result;
};
