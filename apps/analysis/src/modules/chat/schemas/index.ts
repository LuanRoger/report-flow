import { messageRoles, messageStatuses } from "database";
import z from "zod";
import { CHAT_MESSAGE_CONSTRAINTS } from "../constants";

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
