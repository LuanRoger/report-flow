import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { asArray, asRecord, asString } from "../shared/validation.ts";
import {
  type ExpectedFact,
  RAG_CATEGORIES,
  type RagCategory,
  type RagGoldCase,
} from "./types.ts";

export const RAG_GOLD_PATH = resolve(
  import.meta.dir,
  "../../gold/rag-cases.json"
);
const CONTEXT_ID_PATTERN = /^ctx:[a-z0-9][a-z0-9:._-]*$/;
const CASE_ID_PATTERN = /^rag-(direct|comparison|event|insufficient)-[0-9]{2}$/;

const parseCategory = (value: unknown, path: string): RagCategory => {
  if (
    typeof value === "string" &&
    RAG_CATEGORIES.includes(value as RagCategory)
  ) {
    return value as RagCategory;
  }
  throw new Error(`${path} must be a supported RAG category`);
};

const parseExpectedValue = (value: unknown, path: string): number | string => {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  throw new Error(`${path} must be a finite number or string`);
};

const parseExpectedFact = (value: unknown, path: string): ExpectedFact => {
  const record = asRecord(value, path);
  const fact: ExpectedFact = {
    expectedValue: parseExpectedValue(
      record.expectedValue,
      `${path}.expectedValue`
    ),
    field: asString(record.field, `${path}.field`),
  };
  if (record.tolerance !== undefined) {
    if (
      typeof record.tolerance !== "number" ||
      !Number.isFinite(record.tolerance) ||
      record.tolerance < 0
    ) {
      throw new Error(`${path}.tolerance must be a nonnegative finite number`);
    }
    fact.tolerance = record.tolerance;
  }
  return fact;
};

const parseCase = (value: unknown, index: number): RagGoldCase => {
  const path = `ragCases[${index}]`;
  const record = asRecord(value, path);
  const id = asString(record.id, `${path}.id`);
  if (!CASE_ID_PATTERN.test(id)) {
    throw new Error(`${path}.id has an invalid format`);
  }
  const category = parseCategory(record.category, `${path}.category`);
  const { mustAbstain, pondId } = record;
  if (!Number.isSafeInteger(pondId) || (pondId as number) <= 0) {
    throw new Error(`${path}.pondId must be a positive integer`);
  }
  if (typeof mustAbstain !== "boolean") {
    throw new Error(`${path}.mustAbstain must be boolean`);
  }
  if (mustAbstain !== (category === "insufficient")) {
    throw new Error(
      `${path}.mustAbstain must be true exactly for insufficient cases`
    );
  }

  const expectedContextIds = asArray(
    record.expectedContextIds,
    `${path}.expectedContextIds`
  ).map((entry, contextIndex) => {
    const contextId = asString(
      entry,
      `${path}.expectedContextIds[${contextIndex}]`
    );
    if (!CONTEXT_ID_PATTERN.test(contextId)) {
      throw new Error(`${path} contains an invalid context ID`);
    }
    return contextId;
  });
  if (new Set(expectedContextIds).size !== expectedContextIds.length) {
    throw new Error(`${path}.expectedContextIds must be unique`);
  }
  if (category !== "insufficient" && expectedContextIds.length === 0) {
    throw new Error(`${path} answerable case needs an expected context`);
  }

  const expectedFacts = asArray(
    record.expectedFacts,
    `${path}.expectedFacts`
  ).map((entry, factIndex) =>
    parseExpectedFact(entry, `${path}.expectedFacts[${factIndex}]`)
  );
  if (expectedFacts.length === 0) {
    throw new Error(`${path}.expectedFacts must not be empty`);
  }
  const forbiddenUnsupportedClaims =
    record.forbiddenUnsupportedClaims === undefined
      ? []
      : asArray(
          record.forbiddenUnsupportedClaims,
          `${path}.forbiddenUnsupportedClaims`
        ).map((entry, claimIndex) =>
          asString(entry, `${path}.forbiddenUnsupportedClaims[${claimIndex}]`)
        );

  return {
    category,
    expectedContextIds,
    expectedFacts,
    forbiddenUnsupportedClaims,
    id,
    mustAbstain,
    pondId: pondId as number,
    question: asString(record.question, `${path}.question`),
  };
};

export const parseRagGoldCases = (value: unknown): RagGoldCase[] => {
  const cases = asArray(value, "ragCases").map(parseCase);
  if (cases.length !== 40) {
    throw new Error(
      `RAG gold set must contain exactly 40 cases; found ${cases.length}`
    );
  }
  const ids = cases.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("RAG gold case IDs must be unique");
  }
  for (const category of RAG_CATEGORIES) {
    const count = cases.filter((entry) => entry.category === category).length;
    if (count !== 10) {
      throw new Error(
        `RAG category ${category} must contain 10 cases; found ${count}`
      );
    }
  }
  return cases;
};

export const loadRagGoldCases = async (
  path = RAG_GOLD_PATH
): Promise<RagGoldCase[]> => {
  const serialized = await readFile(path, "utf8");
  return parseRagGoldCases(JSON.parse(serialized) as unknown);
};
