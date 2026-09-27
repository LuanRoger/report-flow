import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { ArtifactStore } from "../../src/runtime/artifacts.ts";

const temporaryDirectories: string[] = [];

const createStore = async (): Promise<ArtifactStore> => {
  const directory = await mkdtemp(resolve(tmpdir(), "report-flow-evaluation-"));
  temporaryDirectories.push(directory);
  return new ArtifactStore(directory);
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

describe("immutable run artifacts", () => {
  test("creates one run and refuses to overwrite artifacts", async () => {
    const store = await createStore();
    await store.initializeRun("run-001");
    const artifactPath = await store.writeJson(
      "run-001",
      "correctness/result.json",
      { passed: true }
    );

    expect(JSON.parse(await readFile(artifactPath, "utf8"))).toEqual({
      passed: true,
    });
    expect(() => store.initializeRun("run-001")).toThrow();
    expect(() =>
      store.writeJson("run-001", "correctness/result.json", { passed: false })
    ).toThrow();
  });

  test("rejects unsafe run and artifact paths", async () => {
    const store = await createStore();
    expect(() => store.initializeRun("../escape")).toThrow("Run ID");

    await store.initializeRun("safe-run");
    expect(() =>
      store.writeText("safe-run", "../escape.txt", "unsafe")
    ).toThrow("escapes");
  });

  test("streams NDJSON to an exclusive artifact", async () => {
    const store = await createStore();
    await store.initializeRun("stream-run");
    const writer = await store.openNdjson("stream-run", "ingestion/raw.ndjson");
    await writer.append({ sequence: 1 });
    await writer.append({ sequence: 2 });
    await writer.close();

    const output = await readFile(
      resolve(store.runPath("stream-run"), "ingestion/raw.ndjson"),
      "utf8"
    );
    expect(output).toBe('{"sequence":1}\n{"sequence":2}\n');
  });
});
