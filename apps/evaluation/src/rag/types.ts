export const RAG_CATEGORIES = [
  "comparison",
  "direct",
  "event",
  "insufficient",
] as const;

export type RagCategory = (typeof RAG_CATEGORIES)[number];

export interface ExpectedFact {
  expectedValue: number | string;
  field: string;
  tolerance?: number;
}

export interface RagGoldCase {
  category: RagCategory;
  expectedContextIds: string[];
  expectedFacts: ExpectedFact[];
  forbiddenUnsupportedClaims: string[];
  id: string;
  mustAbstain: boolean;
  pondId: number;
  question: string;
}

export interface RagContextMapping {
  analysisId: number;
  contextId: string;
}

export interface RetrievalCandidate {
  analysisId?: number;
  contextId?: string;
  rank: number;
  similarity: number | null;
  sourceKey: string | null;
}

export interface RetrievalExecution {
  candidates: RetrievalCandidate[];
  caseId: string;
  pondId: number;
  queryEmbeddingMs: number;
  retrievalMs: number;
  topK: number;
  trial: number;
}

export interface AnswerClaim {
  sourceContextIds: string[];
  supported: boolean;
  text: string;
  verifiable: boolean;
}

export interface AnswerExecution {
  caseId: string;
  claims: AnswerClaim[];
  explicitAbstention: boolean;
  observedFacts: Record<string, number | string>;
  responseText: string;
  totalMs: number;
  trial: number;
  ttftMs: number;
}
