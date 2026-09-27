import { resolve } from "node:path";
import { spawn } from "bun";
import { EVALUATION_ROOT } from "../shared/paths.ts";

export const K6_PROFILES = {
  "analysis-7d": "analysis-7d.js",
  "analysis-30d": "analysis-30d.js",
  ingestion: "ingestion.js",
} as const;

export type K6Profile = keyof typeof K6_PROFILES;

export const parseK6Profile = (value: string | undefined): K6Profile => {
  if (value && Object.hasOwn(K6_PROFILES, value)) {
    return value as K6Profile;
  }
  throw new Error(
    `k6 profile must be one of: ${Object.keys(K6_PROFILES).join(", ")}`
  );
};

export const buildK6Arguments = (
  profile: K6Profile,
  forwardedArguments: readonly string[] = []
): string[] => [
  "run",
  ...forwardedArguments,
  resolve(EVALUATION_ROOT, "k6", K6_PROFILES[profile]),
];

export const runK6 = async (
  profile: K6Profile,
  forwardedArguments: readonly string[] = []
): Promise<number> => {
  let processHandle: ReturnType<typeof spawn>;
  try {
    processHandle = spawn(
      ["k6", ...buildK6Arguments(profile, forwardedArguments)],
      {
        env: process.env,
        stderr: "inherit",
        stdin: "inherit",
        stdout: "inherit",
      }
    );
  } catch (error) {
    throw new Error(
      "Unable to start k6. Install k6 and ensure the executable is available on PATH.",
      { cause: error }
    );
  }

  return await processHandle.exited;
};

const main = async (): Promise<void> => {
  const [profileValue, ...forwardedArguments] = process.argv.slice(2);
  const exitCode = await runK6(
    parseK6Profile(profileValue),
    forwardedArguments
  );
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
};

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
