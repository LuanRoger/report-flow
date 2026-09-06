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

type SemanticAdvisorAnalysis = AdvisorAnalysis & { similarity: number };

function mergeAnalysisCandidates(
  recentAnalyses: AdvisorAnalysis[],
  semanticAnalyses: SemanticAdvisorAnalysis[]
): Map<number, AnalysisCandidate> {
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
  query: string
): Promise<AdvisorSource[]> {
  const [queryEmbedding, recentAnalyses] = await Promise.all([
    generateEmbedding(query),
    findRecentAnalysesForPond(
      pondId,
      ADVISOR_RETRIEVAL_CONFIG.recentResultLimit
    ),
  ]);
  const semanticAnalyses = await findSemanticallyRelevantAnalysesForPond(
    pondId,
    queryEmbedding,
    ADVISOR_RETRIEVAL_CONFIG.semanticResultLimit,
    ADVISOR_RETRIEVAL_CONFIG.minimumSimilarity
  );
  const candidates = mergeAnalysisCandidates(recentAnalyses, semanticAnalyses);

  return createRankedAdvisorSources(candidates);
}
