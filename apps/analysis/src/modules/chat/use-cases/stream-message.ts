import { openai } from "@ai-sdk/openai";
import {
  consumeStream,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isReasoningUIPart,
  isTextUIPart,
  safeValidateUIMessages,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";

import {
  ADVISOR_CHAT_MODEL,
  ADVISOR_HISTORY_MESSAGE_LIMIT,
  ADVISOR_MAX_OUTPUT_TOKENS,
  ADVISOR_REASONING_EFFORT,
  ADVISOR_REASONING_SUMMARY,
  ADVISOR_STREAM_RETRY_LIMIT,
} from "../constants";
import {
  ChatMessageAlreadySubmittedError,
  ChatMessageConflictError,
  InvalidPersistedChatHistoryError,
} from "../models/errors";
import {
  completeAssistantMessage,
  createPendingAssistantMessage,
  createUserMessage,
  listMessagesByChatId,
  markAssistantMessageIncomplete,
} from "../repository";
import {
  persistedMessagePartsSchema,
  type SubmittedPondChatMessage,
} from "../schemas";
import { formatAdvisorSourceTitle } from "../utils/context";
import { acquirePondChatOperation } from "../utils/operations";
import { buildAdvisorSystemPrompt } from "../utils/prompt";
import { retrieveAdvisorSources } from "../utils/retrieval";
import { getOrCreatePondChat } from ".";

const SAFE_STREAM_ERROR =
  "Não foi possível concluir a resposta. Tente novamente em instantes.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getErrorLogContext(error: unknown): Record<string, unknown> {
  const errorRecord = isRecord(error) ? error : undefined;
  const lastError = isRecord(errorRecord?.lastError)
    ? errorRecord.lastError
    : undefined;
  const underlyingError = lastError ?? errorRecord;
  let message = String(error);

  if (error instanceof Error) {
    ({ message } = error);
  } else if (typeof underlyingError?.message === "string") {
    ({ message } = underlyingError);
  }

  return {
    code: underlyingError?.code,
    errorName: error instanceof Error ? error.name : "UnknownError",
    isRetryable: underlyingError?.isRetryable,
    message,
    statusCode: underlyingError?.statusCode,
  };
}

function getTextContent(message: UIMessage): string {
  return message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function buildRetrievalQuery(messages: UIMessage[]): string {
  return messages
    .filter((message) => message.role === "user")
    .slice(-3)
    .map(getTextContent)
    .filter(Boolean)
    .join("\n");
}

async function getValidatedModelHistory(chatId: number): Promise<UIMessage[]> {
  const persistedMessages = await listMessagesByChatId(chatId);
  const messages = persistedMessages
    .filter(
      (message) => message.role === "user" || message.status === "completed"
    )
    .map((message) => ({
      id: message.messageId,
      parts: message.parts,
      role: message.role,
    }));
  const validation = await safeValidateUIMessages<UIMessage>({ messages });

  if (!validation.success) {
    throw new InvalidPersistedChatHistoryError({ cause: validation.error });
  }

  return validation.data.slice(-ADVISOR_HISTORY_MESSAGE_LIMIT);
}

function getPlainTextParts(message: UIMessage): UIMessage["parts"] {
  return message.parts.filter(isTextUIPart).map(({ text }) => ({
    text,
    type: "text" as const,
  }));
}

function getModelHistory(messages: UIMessage[]): UIMessage[] {
  return messages
    .map((message) => ({
      ...message,
      parts: getPlainTextParts(message),
    }))
    .filter((message) => message.parts.length > 0);
}

function getPersistableResponseParts(message: UIMessage): UIMessage["parts"] {
  return message.parts.map((part) => {
    if (isTextUIPart(part) || isReasoningUIPart(part)) {
      return {
        text: part.text,
        type: part.type,
      };
    }

    return part;
  });
}

async function createPondChatMessageStream(
  pondId: number,
  submittedMessage: SubmittedPondChatMessage,
  abortSignal: AbortSignal,
  releaseOperation: () => void
): Promise<Response> {
  const chat = await getOrCreatePondChat(pondId);
  const [submittedTextPart] = submittedMessage.parts;
  const userContent = submittedTextPart.text;
  const userParts = persistedMessagePartsSchema.parse(submittedMessage.parts);
  const savedUserMessage = await createUserMessage({
    chatId: chat.id,
    content: userContent,
    messageId: submittedMessage.id,
    parts: userParts,
  });

  if (!savedUserMessage.created) {
    const hasConflictingContent =
      savedUserMessage.message.role !== "user" ||
      savedUserMessage.message.content !== userContent;

    if (hasConflictingContent) {
      throw new ChatMessageConflictError(submittedMessage.id);
    }

    throw new ChatMessageAlreadySubmittedError(submittedMessage.id);
  }

  const history = await getValidatedModelHistory(chat.id);
  const retrievalQuery = buildRetrievalQuery(history);
  const sources = await retrieveAdvisorSources(pondId, retrievalQuery);
  const assistantMessage = await createPendingAssistantMessage(
    chat.id,
    crypto.randomUUID()
  );
  const system = buildAdvisorSystemPrompt(sources);
  const modelMessages = await convertToModelMessages(getModelHistory(history));
  let finalStatus: "aborted" | "completed" | "failed" | undefined;

  const markIncomplete = async (
    status: "aborted" | "failed"
  ): Promise<void> => {
    if (finalStatus) {
      return;
    }

    finalStatus = status;
    await markAssistantMessageIncomplete(assistantMessage.id, status);
  };

  const stream = createUIMessageStream<UIMessage>({
    execute: async ({ writer }) => {
      writer.write({
        messageId: assistantMessage.messageId,
        type: "start",
      });

      for (const source of sources) {
        writer.write({
          mediaType: "application/vnd.report-flow.analysis",
          sourceId: source.sourceKey,
          title: formatAdvisorSourceTitle(source),
          type: "source-document",
        });
      }

      try {
        const result = streamText({
          abortSignal,
          maxOutputTokens: ADVISOR_MAX_OUTPUT_TOKENS,
          messages: modelMessages,
          model: openai(ADVISOR_CHAT_MODEL),
          onAbort: async () => {
            await markIncomplete("aborted");
          },
          onError: ({ error }) => {
            console.warn(
              "Advisor model stream attempt failed",
              getErrorLogContext(error)
            );
          },
          providerOptions: {
            openai: {
              reasoningEffort: ADVISOR_REASONING_EFFORT,
              reasoningSummary: ADVISOR_REASONING_SUMMARY,
            },
          },
          streamRetries: ADVISOR_STREAM_RETRY_LIMIT,
          system,
        });

        writer.merge(
          toUIMessageStream({
            onError: (error) => {
              writer.setOutcome({ error, status: "failed" });
              console.error(
                "Advisor model stream failed",
                getErrorLogContext(error)
              );
              return SAFE_STREAM_ERROR;
            },
            sendReasoning: true,
            sendSources: false,
            sendStart: false,
            stream: result.stream,
          })
        );
      } catch (error) {
        await markIncomplete("failed");
        throw error;
      }
    },
    onEnd: async ({ isAborted, outcome, responseMessage }) => {
      try {
        if (finalStatus) {
          return;
        }
        if (isAborted || outcome.status === "aborted") {
          await markIncomplete("aborted");
          return;
        }
        if (outcome.status === "failed") {
          await markIncomplete("failed");
          return;
        }

        const parts = persistedMessagePartsSchema.parse(
          getPersistableResponseParts(responseMessage)
        );

        try {
          await completeAssistantMessage({
            chatId: chat.id,
            content: getTextContent(responseMessage),
            messageRowId: assistantMessage.id,
            parts,
            sources,
          });
          finalStatus = "completed";
        } catch (error) {
          await markIncomplete("failed");
          throw error;
        }
      } finally {
        releaseOperation();
      }
    },
    onError: (error) => {
      console.error(
        "Advisor chat stream processing failed",
        getErrorLogContext(error)
      );
      releaseOperation();
      return SAFE_STREAM_ERROR;
    },
    originalMessages: history,
  });

  return createUIMessageStreamResponse({
    consumeSseStream: ({ stream: sseStream }) =>
      consumeStream({ stream: sseStream }),
    stream,
  });
}

export async function streamPondChatMessage(
  pondId: number,
  submittedMessage: SubmittedPondChatMessage,
  abortSignal: AbortSignal
): Promise<Response> {
  const releaseOperation = await acquirePondChatOperation(pondId, "streaming");

  try {
    return await createPondChatMessageStream(
      pondId,
      submittedMessage,
      abortSignal,
      releaseOperation
    );
  } catch (error) {
    releaseOperation();
    throw error;
  }
}
