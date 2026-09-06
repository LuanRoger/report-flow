/** biome-ignore-all lint/performance/noNamespaceImport: Need to import all schemas to define relations */
import { defineRelations } from "drizzle-orm";
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
  ...analysisEmbeddings,
  ...messages,
  ...messageSources,
  ...chats,
};

export const relations = defineRelations(schemas, (relation) => ({
  analysisEmbeddings: {
    analysis: relation.one.analysisResults({
      from: relation.analysisEmbeddings.analysisId,
      to: relation.analysisResults.id,
    }),
  },
  analysisResults: {
    cycle: relation.one.pondCycles({
      from: relation.analysisResults.cycleId,
      to: relation.pondCycles.id,
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
      from: relation.measurements.cycleId,
      to: relation.pondCycles.id,
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
