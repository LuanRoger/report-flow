import { createHash } from "node:crypto";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

const normalizeJsonValue = (value: unknown, path: string): JsonValue => {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${path} contains a nonfinite number`);
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      entry === undefined
        ? null
        : normalizeJsonValue(entry, `${path}[${index}]`)
    );
  }

  if (typeof value !== "object") {
    throw new Error(`${path} contains a value that JSON cannot represent`);
  }

  const normalized: { [key: string]: JsonValue } = {};
  const entries = Object.entries(value).sort(([left], [right]) =>
    left.localeCompare(right)
  );

  for (const [key, entry] of entries) {
    if (entry !== undefined) {
      normalized[key] = normalizeJsonValue(entry, `${path}.${key}`);
    }
  }

  return normalized;
};

const stringifyNormalized = (
  value: JsonValue,
  indentation?: number
): string => {
  const serialized = JSON.stringify(value, null, indentation);
  if (serialized === undefined) {
    throw new Error("Failed to serialize JSON value");
  }
  return serialized;
};

export const canonicalJson = (value: unknown): string =>
  stringifyNormalized(normalizeJsonValue(value, "$"));

export const stablePrettyJson = (value: unknown): string =>
  `${stringifyNormalized(normalizeJsonValue(value, "$"), 2)}\n`;

export const sha256Text = (value: string): string =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;

export const checksumJson = (value: unknown): string =>
  sha256Text(canonicalJson(value));
