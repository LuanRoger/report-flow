export interface ParsedArguments {
  flags: ReadonlySet<string>;
  options: ReadonlyMap<string, string>;
  positionals: readonly string[];
}

interface MutableArguments {
  flags: Set<string>;
  options: Map<string, string>;
  positionals: string[];
}

const OPTION_PREFIX = "--";

const normalizeName = (name: string): string =>
  name.startsWith(OPTION_PREFIX) ? name.slice(OPTION_PREFIX.length) : name;

const assertUniqueName = (state: MutableArguments, name: string): void => {
  if (state.flags.has(name) || state.options.has(name)) {
    throw new Error(`CLI option --${name} was provided more than once`);
  }
};

const parseLongArgument = (
  argument: string,
  nextArgument: string | undefined,
  state: MutableArguments
): number => {
  const equalsIndex = argument.indexOf("=");
  if (equalsIndex >= 0) {
    const name = normalizeName(argument.slice(0, equalsIndex));
    const value = argument.slice(equalsIndex + 1);
    if (!(name && value)) {
      throw new Error(`Invalid CLI option: ${argument}`);
    }
    assertUniqueName(state, name);
    state.options.set(name, value);
    return 1;
  }

  const name = normalizeName(argument);
  if (!name) {
    throw new Error("A bare -- is not a supported argument");
  }
  assertUniqueName(state, name);
  if (nextArgument === undefined || nextArgument.startsWith(OPTION_PREFIX)) {
    state.flags.add(name);
    return 1;
  }
  state.options.set(name, nextArgument);
  return 2;
};

export const parseArguments = (
  argumentsList: readonly string[]
): ParsedArguments => {
  const state: MutableArguments = {
    flags: new Set<string>(),
    options: new Map<string, string>(),
    positionals: [],
  };
  let index = 0;

  while (index < argumentsList.length) {
    const argument = argumentsList[index];
    if (argument === undefined) {
      throw new Error("CLI argument unexpectedly disappeared");
    }
    if (!argument.startsWith(OPTION_PREFIX)) {
      state.positionals.push(argument);
      index += 1;
      continue;
    }
    index += parseLongArgument(argument, argumentsList[index + 1], state);
  }

  return state;
};

export const getOptionalOption = (
  argumentsValue: ParsedArguments,
  name: string
): string | undefined => argumentsValue.options.get(normalizeName(name));

export const getRequiredOption = (
  argumentsValue: ParsedArguments,
  name: string
): string => {
  const normalizedName = normalizeName(name);
  const value = argumentsValue.options.get(normalizedName);
  if (value === undefined) {
    throw new Error(`Missing required option --${normalizedName}`);
  }
  return value;
};

export const hasFlag = (
  argumentsValue: ParsedArguments,
  name: string
): boolean => argumentsValue.flags.has(normalizeName(name));

interface AllowedArguments {
  flags?: readonly string[];
  options?: readonly string[];
  positionalCount?: number;
}

export const assertOnlyArguments = (
  argumentsValue: ParsedArguments,
  allowed: AllowedArguments
): void => {
  const allowedFlags = new Set((allowed.flags ?? []).map(normalizeName));
  const allowedOptions = new Set((allowed.options ?? []).map(normalizeName));

  for (const flag of argumentsValue.flags) {
    if (!allowedFlags.has(flag)) {
      throw new Error(`Unsupported flag --${flag}`);
    }
  }
  for (const name of argumentsValue.options.keys()) {
    if (!allowedOptions.has(name)) {
      throw new Error(`Unsupported option --${name}`);
    }
  }

  const expectedPositionalCount = allowed.positionalCount ?? 0;
  if (argumentsValue.positionals.length !== expectedPositionalCount) {
    throw new Error(
      `Expected ${expectedPositionalCount} positional arguments, received ${argumentsValue.positionals.length}`
    );
  }
};

export const parsePositiveIntegerOption = (
  argumentsValue: ParsedArguments,
  name: string,
  fallback?: number
): number => {
  const rawValue = getOptionalOption(argumentsValue, name);
  if (rawValue === undefined) {
    if (fallback === undefined) {
      throw new Error(`Missing required option --${normalizeName(name)}`);
    }
    return fallback;
  }

  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`--${normalizeName(name)} must be a positive integer`);
  }
  return value;
};
