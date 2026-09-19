import { retrieveAdvisorSources } from "../advisor/retrieval";
import { ADVISOR_RETRIEVAL_CONFIG } from "../constants";
import type { AdvisorRetrievalResponse } from "../schemas";

export async function retrievePondAdvisorSources(
  pondId: number,
  query: string
): Promise<AdvisorRetrievalResponse> {
  const { sources, timings } = await retrieveAdvisorSources(pondId, query);

  return {
    candidates: sources.map(({ analysisId, rank, similarity, sourceKey }) => ({
      analysisId,
      rank,
      similarity,
      sourceKey,
    })),
    config: {
      minimumSimilarity: ADVISOR_RETRIEVAL_CONFIG.minimumSimilarity,
      recentResultLimit: ADVISOR_RETRIEVAL_CONFIG.recentResultLimit,
      semanticResultLimit: ADVISOR_RETRIEVAL_CONFIG.semanticResultLimit,
    },
    filters: { pondId },
    queryEmbeddingMs: timings.queryEmbeddingMs,
    retrievalMs: timings.retrievalMs,
    schemaVersion: 1,
    topK: ADVISOR_RETRIEVAL_CONFIG.contextSourceLimit,
  };
}
