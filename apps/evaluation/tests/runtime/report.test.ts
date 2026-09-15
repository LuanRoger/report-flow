import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { ArtifactStore } from "../../src/runtime/artifacts.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

describe("artifact discovery", () => {
  test("lists immutable files in stable relative order", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "evaluation-report-"));
    temporaryDirectories.push(directory);
    const store = new ArtifactStore(directory);
    await store.initializeRun("report-run");
    await store.writeJson("report-run", "seeds/z.json", { passed: true });
    await store.writeJson("report-run", "correctness/a.json", { passed: true });

    expect(await store.listFiles("report-run")).toEqual([
      "correctness/a.json",
      "seeds/z.json",
    ]);
  });
});
