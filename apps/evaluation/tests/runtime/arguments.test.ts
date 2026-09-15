import { describe, expect, test } from "bun:test";
import {
  assertOnlyArguments,
  getRequiredOption,
  hasFlag,
  parseArguments,
  parsePositiveIntegerOption,
} from "../../src/runtime/arguments.ts";

describe("CLI arguments", () => {
  test("parses options, equals syntax, flags, and positionals", () => {
    const parsed = parseArguments([
      "command",
      "--run-id",
      "run-1",
      "--windows=7d,30d",
      "--confirm-reset",
    ]);

    expect(parsed.positionals).toEqual(["command"]);
    expect(getRequiredOption(parsed, "run-id")).toBe("run-1");
    expect(getRequiredOption(parsed, "windows")).toBe("7d,30d");
    expect(hasFlag(parsed, "confirm-reset")).toBe(true);
  });

  test("rejects duplicate and unsupported options", () => {
    expect(() => parseArguments(["--run-id", "a", "--run-id", "b"])).toThrow(
      "more than once"
    );

    const parsed = parseArguments(["--unexpected"]);
    expect(() => assertOnlyArguments(parsed, {})).toThrow("Unsupported flag");
  });

  test("parses positive integer options", () => {
    const parsed = parseArguments(["--samples", "30"]);
    expect(parsePositiveIntegerOption(parsed, "samples")).toBe(30);
    expect(parsePositiveIntegerOption(parseArguments([]), "samples", 5)).toBe(
      5
    );
    expect(() =>
      parsePositiveIntegerOption(parseArguments(["--samples", "0"]), "samples")
    ).toThrow("positive integer");
  });
});
