import { messageRoles, messageStatuses } from "database";
import z from "zod";
import {
  ADVISOR_RETRIEVAL_CONFIG,
  CHAT_MESSAGE_CONSTRAINTS,
} from "../constants";

export const persistedMessagePartSchema = z
  .object({
    type: z.string().min(1),
  })
  .catchall(z.unknown());

export const persistedMessagePartsSchema = z.array(persistedMessagePartSchema);

const submittedTextPartSchema = z
  .object({
    text: z.string().trim().min(1).max(CHAT_MESSAGE_CONSTRAINTS.characterLimit),
    type: z.literal("text"),
  })
  .strict();

export const submittedUserMessageSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(CHAT_MESSAGE_CONSTRAINTS.idCharacterLimit)
      .regex(CHAT_MESSAGE_CONSTRAINTS.idPattern),
    parts: z.tuple([submittedTextPartSchema]),
    role: z.literal("user"),
  })
  .strict();

export type SubmittedPondChatMessage = z.infer<
  typeof submittedUserMessageSchema
>;

export const submitPondChatMessageSchema = z
  .object({
    message: submittedUserMessageSchema,
  })
  .strict();

export const pondChatParamsSchema = z.object({
  pondId: z.coerce.number().int().positive(),
});

export const advisorRetrievalRequestSchema = z
  .object({
    query: z
      .string()
      .trim()
      .min(1)
      .max(CHAT_MESSAGE_CONSTRAINTS.characterLimit),
  })
  .strict();

const advisorRetrievalCandidateSchema = z
  .object({
    analysisId: z.number().int().positive(),
    rank: z.number().int().positive(),
    similarity: z.number().nullable(),
    sourceKey: z.string().min(1),
  })
  .strict();

export const advisorRetrievalResponseSchema = z
  .object({
    candidates: z.array(advisorRetrievalCandidateSchema),
    config: z
      .object({
        minimumSimilarity: z.literal(
          ADVISOR_RETRIEVAL_CONFIG.minimumSimilarity
        ),
        recentResultLimit: z.literal(
          ADVISOR_RETRIEVAL_CONFIG.recentResultLimit
        ),
        semanticResultLimit: z.literal(
          ADVISOR_RETRIEVAL_CONFIG.semanticResultLimit
        ),
      })
      .strict(),
    filters: z
      .object({
        pondId: z.number().int().positive(),
      })
      .strict(),
    queryEmbeddingMs: z
      .number()
      .nonnegative()
      .describe(
        "Embedding duration; overlaps the concurrent recent-analysis query and is included in retrievalMs"
      ),
    retrievalMs: z
      .number()
      .nonnegative()
      .describe(
        "Total monotonic wall time for retrieval, including query embedding"
      ),
    schemaVersion: z.literal(1),
    topK: z.literal(ADVISOR_RETRIEVAL_CONFIG.contextSourceLimit),
  })
  .strict();

export type AdvisorRetrievalResponse = z.infer<
  typeof advisorRetrievalResponseSchema
>;

export const pondChatSchema = z.object({
  createdAt: z.coerce.date(),
  id: z.number().int().positive(),
  pondId: z.number().int().positive(),
  title: z.string().min(1),
  updatedAt: z.coerce.date(),
});

export const persistedChatMessageSchema = z.object({
  createdAt: z.coerce.date(),
  id: z.string().min(1),
  parts: persistedMessagePartsSchema,
  role: z.enum(messageRoles),
  status: z.enum(messageStatuses),
  updatedAt: z.coerce.date(),
});

export const pondChatHistorySchema = z.object({
  chat: pondChatSchema,
  messages: z.array(persistedChatMessageSchema),
});

export const clearPondChatHistorySchema = z.object({
  clearedMessages: z.number().int().nonnegative(),
});
