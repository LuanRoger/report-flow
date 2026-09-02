import Elysia from "elysia";
import z from "zod";
import {
  clearPondChatHistorySchema,
  pondChatHistorySchema,
  pondChatParamsSchema,
  pondChatSchema,
  submitPondChatMessageSchema,
} from "./schemas";
import {
  clearPondChatHistory,
  getOrCreatePondChat,
  getPondChatHistory,
} from "./use-cases";
import { streamPondChatMessage } from "./use-cases/stream-message";

export const chatsModule = new Elysia({ prefix: "/chats" })
  .post(
    "/ponds/:pondId",
    async ({ params: { pondId }, status }) => {
      const chat = await getOrCreatePondChat(pondId);

      return status("OK", chat);
    },
    {
      detail: {
        description: "Create or load the persistent advisor chat for a pond",
        operationId: "getOrCreatePondChat",
      },
      params: pondChatParamsSchema,
      response: {
        200: pondChatSchema,
        404: z.string(),
        500: z.string(),
      },
    }
  )
  .get(
    "/ponds/:pondId/messages",
    async ({ params: { pondId }, status }) => {
      const history = await getPondChatHistory(pondId);

      return status("OK", history);
    },
    {
      detail: {
        description: "Get persisted advisor chat history for a pond",
        operationId: "getPondChatHistory",
      },
      params: pondChatParamsSchema,
      response: {
        200: pondChatHistorySchema,
        404: z.string(),
        500: z.string(),
      },
    }
  )
  .post(
    "/ponds/:pondId/messages",
    async ({ body, params: { pondId }, request }) =>
      await streamPondChatMessage(pondId, body.message, request.signal),
    {
      body: submitPondChatMessageSchema,
      detail: {
        description: "Stream a grounded advisor response for a pond",
        operationId: "streamPondChatMessage",
      },
      params: pondChatParamsSchema,
    }
  )
  .delete(
    "/ponds/:pondId/messages",
    async ({ params: { pondId }, status }) => {
      const result = await clearPondChatHistory(pondId);

      return status("OK", result);
    },
    {
      detail: {
        description: "Clear persisted advisor chat history for a pond",
        operationId: "clearPondChatHistory",
      },
      params: pondChatParamsSchema,
      response: {
        200: clearPondChatHistorySchema,
        404: z.string(),
        409: z.string(),
        500: z.string(),
      },
    }
  );
