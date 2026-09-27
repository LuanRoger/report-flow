import { loadControlledContextCatalog } from "../rag/catalog.ts";
import {
  assertPaidEmbeddingsAllowed,
  createOpenAiEmbeddingProvider,
} from "../rag/embedding.ts";
import { prepareControlledKnowledgeBase } from "../rag/preparation.ts";
import {
  assertOnlyArguments,
  getRequiredOption,
  hasFlag,
  type ParsedArguments,
  parseArguments,
} from "../runtime/arguments.ts";
import {
  redactSecrets,
  requireEnvironmentValue,
  requireEvaluationDatabaseUrl,
} from "../runtime/environment.ts";
import { loadModelConfig } from "../shared/config.ts";

export const prepareRagCommand = async (
  argumentsValue: ParsedArguments
): Promise<Awaited<ReturnType<typeof prepareControlledKnowledgeBase>>> => {
  assertOnlyArguments(argumentsValue, {
    flags: ["allow-paid-embeddings", "allow-remote-target", "confirm-reset"],
    options: ["run-id"],
  });
  const allowPaidEmbeddings = hasFlag(argumentsValue, "allow-paid-embeddings");
  assertPaidEmbeddingsAllowed(allowPaidEmbeddings);
  const [catalog, model] = await Promise.all([
    loadControlledContextCatalog(),
    loadModelConfig(),
  ]);

  return await prepareControlledKnowledgeBase(
    catalog,
    model,
    {
      allowPaidEmbeddings,
      allowRemoteTarget: hasFlag(argumentsValue, "allow-remote-target"),
      analysisApiKey: requireEnvironmentValue("ANALYSIS_API_KEY"),
      analysisApiUrl:
        process.env.ANALYSIS_API_URL?.trim() || "http://localhost:3001",
      confirmReset: hasFlag(argumentsValue, "confirm-reset"),
      databaseUrl: requireEvaluationDatabaseUrl(),
      runId: getRequiredOption(argumentsValue, "run-id"),
    },
    {
      embeddingProvider: createOpenAiEmbeddingProvider(
        requireEnvironmentValue("OPENAI_API_KEY")
      ),
    }
  );
};

const main = async (): Promise<void> => {
  const result = await prepareRagCommand(parseArguments(process.argv.slice(2)));
  process.stdout.write(
    `${JSON.stringify({
      analysisCount: result.analysisCount,
      command: "prepare-rag",
      embeddingCount: result.embeddingCount,
      measurementCount: result.measurementCount,
      passed: result.passed,
    })}\n`
  );
};

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`RAG preparation failed: ${redactSecrets(message)}\n`);
    process.exitCode = 1;
  }
}
