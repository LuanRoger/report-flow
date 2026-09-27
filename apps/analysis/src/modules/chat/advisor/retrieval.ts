import { generateEmbedding } from "../../analysis/utils/rag";
import { ADVISOR_RETRIEVAL_CONFIG } from "../constants";
import {
  type AdvisorAnalysis,
  findRecentAnalysesForPond,
  findSemanticallyRelevantAnalysesForPond,
} from "../repository/advisor-analyses";
import { type AdvisorSource, createAdvisorSource } from "./source-context";

interface AnalysisCandidate {
  analysis: AdvisorAnalysis;
  similarity: number | null;
}

export interface AdvisorRetrievalResult {
  sources: AdvisorSource[];
  timings: {
    queryEmbeddingMs: number;
    retrievalMs: number;
  };
}

type MonotonicClock = () => number;
type SemanticAdvisorAnalysis = AdvisorAnalysis & { similarity: number };

const monotonicNow = (): number => performance.now();

const elapsedMilliseconds = (startedAt: number, endedAt: number): number =>
  Math.max(0, endedAt - startedAt);

function mergeAnalysisCandidates(
  recentAnalyses: AdvisorAnalysis[],
  semanticAnalyses: SemanticAdvisorAnalysis[]
): Map<number, AnalysisCandidate> {
  const candidates = new Map<number, AnalysisCandidate>();

  for (const analysis of semanticAnalyses) {
    candidates.set(analysis.analysisId, {
      analysis,
      similarity: analysis.similarity,
    });
  }

  for (const analysis of recentAnalyses) {
    if (candidates.has(analysis.analysisId)) {
      continue;
    }

    candidates.set(analysis.analysisId, { analysis, similarity: null });
  }

  return candidates;
}

function createRankedAdvisorSources(
  candidates: Map<number, AnalysisCandidate>
): AdvisorSource[] {
  const sources: AdvisorSource[] = [];

  for (const candidate of candidates.values()) {
    if (sources.length >= ADVISOR_RETRIEVAL_CONFIG.contextSourceLimit) {
      break;
    }

    sources.push(
      createAdvisorSource(
        candidate.analysis,
        sources.length + 1,
        candidate.similarity
      )
    );
  }

  return sources;
}

export async function retrieveAdvisorSources(
  pondId: number,
  query: string,
  clock: MonotonicClock = monotonicNow
): Promise<AdvisorRetrievalResult> {
  const retrievalStartedAt = clock();
  const queryEmbeddingStartedAt = clock();
  let queryEmbeddingMs = 0;
  const queryEmbeddingPromise = generateEmbedding(query).finally(() => {
    queryEmbeddingMs = elapsedMilliseconds(queryEmbeddingStartedAt, clock());
  });
  const recentAnalysesPromise = findRecentAnalysesForPond(
    pondId,
    ADVISOR_RETRIEVAL_CONFIG.recentResultLimit
  );
  const [queryEmbedding, recentAnalyses] = await Promise.all([
    queryEmbeddingPromise,
    recentAnalysesPromise,
  ]);
  const semanticAnalyses = await findSemanticallyRelevantAnalysesForPond(
    pondId,
    queryEmbedding,
    ADVISOR_RETRIEVAL_CONFIG.semanticResultLimit,
    ADVISOR_RETRIEVAL_CONFIG.minimumSimilarity
  );
  const candidates = mergeAnalysisCandidates(recentAnalyses, semanticAnalyses);
  const sources = createRankedAdvisorSources(candidates);

  return {
    sources,
    timings: {
      queryEmbeddingMs,
      retrievalMs: elapsedMilliseconds(retrievalStartedAt, clock()),
    },
  };
}
