import type { UIMessage } from "ai";
import z from "zod";

export const loadPondChatInputSchema = z.object({
  pondId: z.number(),
});

export const clearPondChatHistoryInputSchema = z.object({
  pondId: z.number(),
});

export const loadPondChatResultSchema = z.object({
  chat: z.object({
    id: z.number(),
    pondId: z.number(),
    title: z.string(),
  }),
  messages: z.array(z.custom<UIMessage>()),
});

export const clearPondChatHistoryResultSchema = z
  .object({
    clearedMessages: z.number().int().nonnegative(),
  })
  .strict();

export const pondChatSchema = z
  .object({
    createdAt: z.iso.datetime(),
    id: z.number().int().positive(),
    pondId: z.number().int().positive(),
    title: z.string().min(1),
    updatedAt: z.iso.datetime(),
  })
  .strict();

const persistedChatMessageSchema = z
  .object({
    createdAt: z.iso.datetime(),
    id: z.string().min(1),
    parts: z.array(z.unknown()),
    role: z.enum(["user", "assistant"]),
    status: z.enum(["streaming", "completed", "failed", "aborted"]),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const pondChatHistorySchema = z
  .object({
    chat: pondChatSchema,
    messages: z.array(persistedChatMessageSchema),
  })
  .strict();
