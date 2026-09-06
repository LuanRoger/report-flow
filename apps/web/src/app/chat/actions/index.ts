"use server";

import { safeValidateUIMessages, type UIMessage } from "ai";
import { getAnalysisApi } from "@/lib/http";
import { actionClient } from "@/lib/safe-actions";
import {
  clearPondChatHistoryInputSchema,
  clearPondChatHistoryResultSchema,
  loadPondChatInputSchema,
  loadPondChatResultSchema,
  pondChatHistorySchema,
  pondChatSchema,
} from "./schemas";

export const loadPondChat = actionClient
  .inputSchema(loadPondChatInputSchema)
  .action(async ({ parsedInput }) => {
    const { pondId } = parsedInput;

    const analysisApi = getAnalysisApi();
    const chatResponse = await analysisApi.post(`/chats/ponds/${pondId}`, {
      cache: "no-store",
      throwHttpErrors: false,
    });

    const chatResult = pondChatSchema.parse(await chatResponse.json());

    const historyResponse = await analysisApi.get(
      `/chats/ponds/${pondId}/messages`,
      {
        cache: "no-store",
        throwHttpErrors: false,
      }
    );

    const historyResult = pondChatHistorySchema.parse(
      await historyResponse.json()
    );

    const persistedMessages = historyResult.messages
      .filter(
        (message) => message.role === "user" || message.status === "completed"
      )
      .map((message) => ({
        id: message.id,
        parts: message.parts,
        role: message.role,
      }));

    if (persistedMessages.length === 0) {
      return loadPondChatResultSchema.parse({
        chat: {
          id: chatResult.id,
          pondId,
          title: chatResult.title,
        },
        messages: [],
      });
    }

    const validatedMessages = await safeValidateUIMessages<UIMessage>({
      messages: persistedMessages,
    });

    if (!validatedMessages.success) {
      return loadPondChatResultSchema.parse({
        chat: {
          id: chatResult.id,
          pondId,
          title: chatResult.title,
        },
        messages: [],
      });
    }

    return loadPondChatResultSchema.parse({
      chat: {
        id: chatResult.id,
        pondId,
        title: chatResult.title,
      },
      messages: validatedMessages.data,
    });
  });

export const clearPondChatHistory = actionClient
  .inputSchema(clearPondChatHistoryInputSchema)
  .action(async ({ parsedInput }) => {
    const { pondId } = parsedInput;

    const response = await getAnalysisApi().delete(
      `/chats/ponds/${pondId}/messages`,
      {
        cache: "no-store",
        throwHttpErrors: false,
      }
    );

    return clearPondChatHistoryResultSchema.parse(await response.json());
  });
