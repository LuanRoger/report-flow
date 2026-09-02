import { messageRoles, messageStatuses } from "database";
import z from "zod";
import { ADVISOR_MESSAGE_CHARACTER_LIMIT } from "../constants";

const MESSAGE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export const persistedMessagePartSchema = z
  .object({
    type: z.string().min(1),
  })
  .catchall(z.unknown());

export const persistedMessagePartsSchema = z.array(persistedMessagePartSchema);

const submittedTextPartSchema = z
  .object({
    text: z.string().trim().min(1).max(ADVISOR_MESSAGE_CHARACTER_LIMIT),
    type: z.literal("text"),
  })
  .strict();

const submittedUserMessageSchema = z
  .object({
    id: z.string().min(1).max(128).regex(MESSAGE_ID_PATTERN),
    parts: z.array(submittedTextPartSchema).length(1),
    role: z.literal("user"),
  })
  .strict();

export const submitPondChatMessageSchema = z
  .object({
    message: submittedUserMessageSchema,
  })
  .strict();

export type SubmittedPondChatMessage = z.infer<
  typeof submittedUserMessageSchema
>;

export const pondChatParamsSchema = z.object({
  pondId: z.coerce.number().int().positive(),
});

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
