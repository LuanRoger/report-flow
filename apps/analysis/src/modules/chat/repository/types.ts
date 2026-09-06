import type { PersistedMessagePart } from "database";

export interface CreateUserMessageInput {
  chatId: number;
  content: string;
  messageId: string;
  parts: PersistedMessagePart[];
}

export interface PersistedAdvisorSourceInput {
  analysisCreatedAt: Date;
  analysisId: number;
  cycleId: number | null;
  periodEnd: Date;
  periodStart: Date;
  rank: number;
  similarity: number | null;
  sourceKey: string;
}

export interface CompleteAssistantMessageInput {
  chatId: number;
  content: string;
  messageRowId: number;
  parts: PersistedMessagePart[];
  sources: PersistedAdvisorSourceInput[];
}

export type IncompleteAssistantMessageStatus = "aborted" | "failed";
