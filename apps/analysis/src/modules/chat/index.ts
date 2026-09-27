import Elysia from "elysia";
import z from "zod";
import {
  advisorRetrievalRequestSchema,
  advisorRetrievalResponseSchema,
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
} from "./use-cases/pond-chat";
import { retrievePondAdvisorSources } from "./use-cases/retrieve-pond-advisor-sources";
import { streamPondChatMessage } from "./use-cases/stream-pond-chat-message";

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
  .post(
    "/ponds/:pondId/retrieval",
    async ({ body: { query }, params: { pondId }, status }) => {
      const result = await retrievePondAdvisorSources(pondId, query);

      return status("OK", result);
    },
    {
      body: advisorRetrievalRequestSchema,
      detail: {
        description:
          "Retrieve advisor source candidates and timing telemetry without generating a response. Query embedding overlaps the recent-analysis lookup and is included in retrievalMs.",
        operationId: "retrievePondAdvisorSources",
        security: [{ bearerAuth: [] }],
      },
      params: pondChatParamsSchema,
      response: {
        200: advisorRetrievalResponseSchema,
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
