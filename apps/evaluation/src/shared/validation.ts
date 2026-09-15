export const asRecord = (
  value: unknown,
  path: string
): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
};

export const asArray = (value: unknown, path: string): unknown[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array`);
  }
  return value;
};

export const asString = (value: unknown, path: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path} must be a nonempty string`);
  }
  return value;
};

export const asFiniteNumber = (value: unknown, path: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number`);
  }
  return value;
};

export const asSafeInteger = (value: unknown, path: string): number => {
  const number = asFiniteNumber(value, path);
  if (!Number.isSafeInteger(number)) {
    throw new Error(`${path} must be a safe integer`);
  }
  return number;
};

export const asPositiveInteger = (value: unknown, path: string): number => {
  const number = asSafeInteger(value, path);
  if (number <= 0) {
    throw new Error(`${path} must be positive`);
  }
  return number;
};

export const asNonnegativeInteger = (value: unknown, path: string): number => {
  const number = asSafeInteger(value, path);
  if (number < 0) {
    throw new Error(`${path} must be nonnegative`);
  }
  return number;
};

export const asStringArray = (value: unknown, path: string): string[] =>
  asArray(value, path).map((entry, index) =>
    asString(entry, `${path}[${index}]`)
  );

export const asOptionalString = (
  value: unknown,
  path: string
): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  return asString(value, path);
};

export const hasOwn = (record: Record<string, unknown>, key: string): boolean =>
  Object.hasOwn(record, key);

export const assertExactKeys = (
  record: Record<string, unknown>,
  expectedKeys: readonly string[],
  path: string
): void => {
  const actualKeys = Object.keys(record).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();

  if (
    actualKeys.length !== sortedExpectedKeys.length ||
    actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
  ) {
    throw new Error(
      `${path} must contain exactly these keys: ${sortedExpectedKeys.join(", ")}`
    );
  }
};
