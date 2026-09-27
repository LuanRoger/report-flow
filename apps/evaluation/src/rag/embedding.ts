import {
  CONTROLLED_EMBEDDING_DIMENSIONS,
  CONTROLLED_EMBEDDING_MODEL,
} from "./catalog.ts";

export interface EmbeddingProvider {
  readonly dimensions: number;
  embed: (content: string) => Promise<readonly number[]>;
  readonly model: string;
}

export type EmbeddingFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

const asEmbedding = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    throw new Error("Embedding provider response did not contain an embedding");
  }
  const embedding = value.map((entry, index) => {
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      throw new Error(`Embedding value ${index} must be a finite number`);
    }
    return entry;
  });
  if (embedding.length !== CONTROLLED_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding must contain exactly ${CONTROLLED_EMBEDDING_DIMENSIONS} dimensions; received ${embedding.length}`
    );
  }
  return embedding;
};

const readOpenAiEmbedding = (value: unknown): number[] => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("OpenAI embedding response must be an object");
  }
  const { data } = value as Record<string, unknown>;
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error(
      "OpenAI embedding response must contain exactly one result"
    );
  }
  const [result] = data;
  if (result === null || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("OpenAI embedding result must be an object");
  }
  return asEmbedding((result as Record<string, unknown>).embedding);
};

export const validateEmbeddingProvider = (
  provider: EmbeddingProvider
): void => {
  if (
    provider.model !== CONTROLLED_EMBEDDING_MODEL ||
    provider.dimensions !== CONTROLLED_EMBEDDING_DIMENSIONS
  ) {
    throw new Error(
      `Controlled embeddings require ${CONTROLLED_EMBEDDING_MODEL} with ${CONTROLLED_EMBEDDING_DIMENSIONS} dimensions`
    );
  }
};

export const assertPaidEmbeddingsAllowed = (
  allowPaidEmbeddings: boolean
): void => {
  if (!allowPaidEmbeddings) {
    throw new Error(
      "Controlled knowledge-base preparation requires explicit allowPaidEmbeddings permission"
    );
  }
};

export const createOpenAiEmbeddingProvider = (
  apiKey: string,
  fetchImplementation: EmbeddingFetch = fetch
): EmbeddingProvider => {
  if (!apiKey.trim()) {
    throw new Error("OPENAI_API_KEY is required for controlled embeddings");
  }

  return {
    dimensions: CONTROLLED_EMBEDDING_DIMENSIONS,
    embed: async (content: string): Promise<readonly number[]> => {
      const response = await fetchImplementation(
        "https://api.openai.com/v1/embeddings",
        {
          body: JSON.stringify({
            dimensions: CONTROLLED_EMBEDDING_DIMENSIONS,
            encoding_format: "float",
            input: content,
            model: CONTROLLED_EMBEDDING_MODEL,
          }),
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          method: "POST",
          signal: AbortSignal.timeout(30_000),
        }
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(
          `OpenAI embedding request failed with HTTP ${response.status}`
        );
      }
      return readOpenAiEmbedding((await response.json()) as unknown);
    },
    model: CONTROLLED_EMBEDDING_MODEL,
  };
};
