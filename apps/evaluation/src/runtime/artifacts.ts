import type { Stats } from "node:fs";
import {
  type FileHandle,
  mkdir,
  open,
  readdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { stablePrettyJson } from "../shared/json.ts";

const RUN_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const RUN_DIRECTORIES = [
  "correctness",
  "ingestion",
  "manifest-events",
  "performance/k6",
  "performance/query-plans",
  "performance/resources",
  "performance/sequential",
  "rag/answers",
  "rag/judgments",
  "rag/preparation",
  "rag/retrieval",
  "reports",
  "seeds",
] as const;

export const DEFAULT_RESULTS_ROOT = resolve(import.meta.dir, "../../results");

const validateRunId = (runId: string): void => {
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error(
      "Run ID must start with an alphanumeric character and contain only letters, numbers, dots, underscores, or hyphens"
    );
  }
};

const resolveContainedPath = (basePath: string, childPath: string): string => {
  if (!childPath || childPath.includes("\0")) {
    throw new Error("Artifact path must be a nonempty relative path");
  }

  const resolvedBase = resolve(basePath);
  const resolvedChild = resolve(resolvedBase, childPath);
  const childRelativePath = relative(resolvedBase, resolvedChild);
  const escapesBase =
    childRelativePath === ".." ||
    childRelativePath.startsWith(`..${sep}`) ||
    resolve(childPath) === resolvedChild;

  if (escapesBase) {
    throw new Error(`Artifact path escapes its run directory: ${childPath}`);
  }
  return resolvedChild;
};

export interface NdjsonWriter {
  append: (value: unknown) => Promise<void>;
  close: () => Promise<void>;
}

const createNdjsonWriter = (fileHandle: FileHandle): NdjsonWriter => {
  let closed = false;

  return {
    append: async (value: unknown): Promise<void> => {
      if (closed) {
        throw new Error("Cannot append to a closed NDJSON artifact");
      }
      await fileHandle.write(`${JSON.stringify(value)}\n`);
    },
    close: async (): Promise<void> => {
      if (!closed) {
        closed = true;
        await fileHandle.close();
      }
    },
  };
};

export class ArtifactStore {
  readonly rootPath: string;

  constructor(rootPath = DEFAULT_RESULTS_ROOT) {
    this.rootPath = resolve(rootPath);
  }

  runPath(runId: string): string {
    validateRunId(runId);
    return resolve(this.rootPath, runId);
  }

  async initializeRun(runId: string): Promise<string> {
    const runPath = this.runPath(runId);
    await mkdir(this.rootPath, { recursive: true });
    await mkdir(runPath, { recursive: false });
    await Promise.all(
      RUN_DIRECTORIES.map((directory) =>
        mkdir(resolve(runPath, directory), { recursive: true })
      )
    );
    return runPath;
  }

  async requireRun(runId: string): Promise<string> {
    const runPath = this.runPath(runId);
    let runStats: Stats;
    try {
      runStats = await stat(runPath);
    } catch (error) {
      throw new Error(
        `Evaluation run ${runId} does not exist; run preflight first`,
        { cause: error }
      );
    }
    if (!runStats.isDirectory()) {
      throw new Error(`Evaluation run path is not a directory: ${runPath}`);
    }
    return runPath;
  }

  async writeJson(
    runId: string,
    relativePath: string,
    value: unknown
  ): Promise<string> {
    return await this.writeText(runId, relativePath, stablePrettyJson(value));
  }

  async writeText(
    runId: string,
    relativePath: string,
    content: string
  ): Promise<string> {
    const runPath = await this.requireRun(runId);
    const artifactPath = resolveContainedPath(runPath, relativePath);
    await mkdir(dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, content, { encoding: "utf8", flag: "wx" });
    return artifactPath;
  }

  async openNdjson(runId: string, relativePath: string): Promise<NdjsonWriter> {
    const runPath = await this.requireRun(runId);
    const artifactPath = resolveContainedPath(runPath, relativePath);
    await mkdir(dirname(artifactPath), { recursive: true });
    const fileHandle = await open(artifactPath, "wx");
    return createNdjsonWriter(fileHandle);
  }

  async readJson(runId: string, relativePath: string): Promise<unknown> {
    const runPath = await this.requireRun(runId);
    const artifactPath = resolveContainedPath(runPath, relativePath);
    const serialized = await readFile(artifactPath, "utf8");
    return JSON.parse(serialized) as unknown;
  }

  async updateManifest(
    runId: string,
    update: (manifest: Record<string, unknown>) => Record<string, unknown>
  ): Promise<void> {
    const runPath = await this.requireRun(runId);
    const manifestPath = resolveContainedPath(runPath, "manifest.json");
    const serialized = await readFile(manifestPath, "utf8");
    const parsed: unknown = JSON.parse(serialized);
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      throw new Error("Run manifest must be a JSON object");
    }
    await writeFile(
      manifestPath,
      stablePrettyJson(update({ ...parsed })),
      "utf8"
    );
  }

  async listFiles(runId: string): Promise<string[]> {
    const runPath = await this.requireRun(runId);
    const files: string[] = [];

    const visit = async (directoryPath: string): Promise<void> => {
      const entries = await readdir(directoryPath, { withFileTypes: true });
      await Promise.all(
        entries.map(async (entry) => {
          const entryPath = resolve(directoryPath, entry.name);
          if (entry.isDirectory()) {
            await visit(entryPath);
          } else if (entry.isFile()) {
            files.push(relative(runPath, entryPath).split(sep).join("/"));
          }
        })
      );
    };

    await visit(runPath);
    files.sort();
    return files;
  }
}

export const artifactStore = new ArtifactStore();
