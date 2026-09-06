export const ADVISOR_MODEL_CONFIG = {
  historyMessageLimit: 30,
  maxOutputTokens: 1600,
  model: "gpt-5.6-luna",
  reasoningEffort: "low",
  reasoningSummary: "auto",
  streamRetryLimit: 2,
} as const;

export const ADVISOR_RETRIEVAL_CONFIG = {
  contextSourceLimit: 5,
  minimumSimilarity: 0.5,
  recentResultLimit: 2,
  semanticResultLimit: 4,
  userMessageQueryLimit: 3,
} as const;

export const ANALYSIS_SOURCE_PROTOCOL = {
  labelPrefix: "S",
  mediaType: "application/vnd.report-flow.analysis",
} as const;

export const CHAT_MESSAGE_CONSTRAINTS = {
  characterLimit: 4000,
  idCharacterLimit: 128,
  idPattern: /^[A-Za-z0-9_-]+$/,
} as const;
