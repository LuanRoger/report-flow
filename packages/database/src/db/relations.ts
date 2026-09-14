/** biome-ignore-all lint/performance/noNamespaceImport: Need to import all schemas to define relations */
import { defineRelations } from "drizzle-orm";
import * as analysisAiSummaries from "../schemas/analysis-ai-summaries";
import * as analysisEmbeddings from "../schemas/analysis-embeddings";
import * as analysisResults from "../schemas/analysis-results";
import * as chats from "../schemas/chats";
import * as measurements from "../schemas/measurements";
import * as messageSources from "../schemas/message-sources";
import * as messages from "../schemas/messages";
import * as pondCycles from "../schemas/pond-cycles";
import * as ponds from "../schemas/ponds";

export const schemas = {
  ...ponds,
  ...pondCycles,
  ...measurements,
  ...analysisResults,
  ...analysisAiSummaries,
  ...analysisEmbeddings,
  ...messages,
  ...messageSources,
  ...chats,
};

export const relations = defineRelations(schemas, (relation) => ({
  analysisAiSummaries: {
    analysis: relation.one.analysisResults({
      from: relation.analysisAiSummaries.analysisId,
      to: relation.analysisResults.id,
    }),
  },
  analysisEmbeddings: {
    analysis: relation.one.analysisResults({
      from: relation.analysisEmbeddings.analysisId,
      to: relation.analysisResults.id,
    }),
  },
  analysisResults: {
    aiSummary: relation.one.analysisAiSummaries({
      from: relation.analysisResults.id,
      to: relation.analysisAiSummaries.analysisId,
    }),
    cycle: relation.one.pondCycles({
      from: [relation.analysisResults.cycleId, relation.analysisResults.pondId],
      to: [relation.pondCycles.id, relation.pondCycles.pondId],
    }),
    messageSources: relation.many.messageSources(),
    pond: relation.one.ponds({
      from: relation.analysisResults.pondId,
      to: relation.ponds.id,
    }),
  },
  chats: {
    messages: relation.many.messages(),
    pond: relation.one.ponds({
      from: relation.chats.pondId,
      to: relation.ponds.id,
    }),
  },
  measurements: {
    cycle: relation.one.pondCycles({
      from: [relation.measurements.cycleId, relation.measurements.pondId],
      to: [relation.pondCycles.id, relation.pondCycles.pondId],
    }),
    pond: relation.one.ponds({
      from: relation.measurements.pondId,
      to: relation.ponds.id,
    }),
  },
  messageSources: {
    analysis: relation.one.analysisResults({
      from: relation.messageSources.analysisId,
      to: relation.analysisResults.id,
    }),
    message: relation.one.messages({
      from: relation.messageSources.messageRowId,
      to: relation.messages.id,
    }),
  },
  messages: {
    chat: relation.one.chats({
      from: relation.messages.chatId,
      to: relation.chats.id,
    }),
    sources: relation.many.messageSources(),
  },
  pondCycles: {
    analysisResults: relation.many.analysisResults(),
    measurements: relation.many.measurements(),
    pond: relation.one.ponds({
      from: relation.pondCycles.pondId,
      to: relation.ponds.id,
    }),
  },
  ponds: {
    chats: relation.many.chats(),
  },
}));
