import { generateEmbedding } from "../../analysis/utils/rag";
import {
  ADVISOR_CONTEXT_SOURCE_LIMIT,
  ADVISOR_MINIMUM_SIMILARITY,
  ADVISOR_RECENT_RESULT_LIMIT,
  ADVISOR_SEMANTIC_RESULT_LIMIT,
} from "../constants";
import {
  findRecentAnalysesForPond,
  findSemanticallyRelevantAnalysesForPond,
} from "../repository";
import {
  type AdvisorAnalysis,
  type AdvisorSource,
  createAdvisorSource,
} from "./context";

interface AnalysisCandidate {
  analysis: AdvisorAnalysis;
  similarity: number | null;
}

export async function retrieveAdvisorSources(
  pondId: number,
  query: string
): Promise<AdvisorSource[]> {
  const [queryEmbedding, recentAnalyses] = await Promise.all([
    generateEmbedding(query),
    findRecentAnalysesForPond(pondId, ADVISOR_RECENT_RESULT_LIMIT),
  ]);
  const semanticAnalyses = await findSemanticallyRelevantAnalysesForPond(
    pondId,
    queryEmbedding,
    ADVISOR_SEMANTIC_RESULT_LIMIT,
    ADVISOR_MINIMUM_SIMILARITY
  );
  const candidates = new Map<number, AnalysisCandidate>();

  for (const analysis of recentAnalyses) {
    candidates.set(analysis.analysisId, { analysis, similarity: null });
  }

  for (const analysis of semanticAnalyses) {
    const existingCandidate = candidates.get(analysis.analysisId);
    if (existingCandidate) {
      existingCandidate.similarity = analysis.similarity;
      continue;
    }

    candidates.set(analysis.analysisId, {
      analysis,
      similarity: analysis.similarity,
    });
  }

  const sources: AdvisorSource[] = [];
  for (const candidate of candidates.values()) {
    if (sources.length >= ADVISOR_CONTEXT_SOURCE_LIMIT) {
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
