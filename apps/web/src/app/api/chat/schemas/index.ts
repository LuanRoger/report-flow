import z from "zod";
import { ADVISOR_MESSAGE_CHARACTER_LIMIT } from "@/app/chat/constants";

const MESSAGE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

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

export const chatSubmitRequestSchema = z
  .object({
    message: submittedUserMessageSchema,
    pondId: z.number().int().positive(),
  })
  .strict();
