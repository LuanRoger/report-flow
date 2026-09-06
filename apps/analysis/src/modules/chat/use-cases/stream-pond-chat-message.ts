import { openai } from "@ai-sdk/openai";
import {
  APICallError,
  consumeStream,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isReasoningUIPart,
  isTextUIPart,
  type ModelMessage,
  RetryError,
  StreamProviderError,
  safeValidateUIMessages,
  streamText,
  toUIMessageStream,
  type UIMessage,
  type UIMessageStreamOutcome,
  type UIMessageStreamWriterWithOutcome,
} from "ai";
import { buildAdvisorSystemPrompt } from "../advisor/prompt";
import { retrieveAdvisorSources } from "../advisor/retrieval";
import {
  type AdvisorSource,
  formatAdvisorSourceTitle,
} from "../advisor/source-context";
import {
  ADVISOR_MODEL_CONFIG,
  ADVISOR_RETRIEVAL_CONFIG,
  ANALYSIS_SOURCE_PROTOCOL,
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
  type IncompleteAssistantMessageStatus,
  listMessagesByChatId,
  markAssistantMessageIncomplete,
} from "../repository/messages";
import type { SubmittedPondChatMessage } from "../schemas";
import { persistedMessagePartsSchema } from "../schemas";
import { acquirePondChatOperation } from "../stores/operations";
import { getOrCreatePondChat } from "./pond-chat";

const SAFE_STREAM_ERROR_MESSAGE =
  "Não foi possível concluir a resposta. Tente novamente em instantes.";

type AssistantMessageFinalStatus =
  | IncompleteAssistantMessageStatus
  | "completed";

interface AdvisorErrorLogContext {
  code?: string | number;
  errorName: string;
  isRetryable?: boolean;
  message: string;
  retryReason?: string;
  statusCode?: number;
}

interface PreparedAdvisorTurn {
  history: UIMessage[];
  modelMessages: ModelMessage[];
  sources: AdvisorSource[];
  systemPrompt: string;
}

interface AssistantMessageLifecycle {
  finalize: (input: FinalizeAssistantMessageInput) => Promise<void>;
  markAborted: () => Promise<void>;
  markFailed: () => Promise<void>;
}

interface CreateAssistantMessageLifecycleInput {
  assistantMessageRowId: number;
  chatId: number;
  releaseOperation: () => void;
  sources: AdvisorSource[];
}

interface FinalizeAssistantMessageInput {
  isAborted: boolean;
  outcome: UIMessageStreamOutcome;
  responseMessage: UIMessage;
}

interface WriteAdvisorModelStreamInput {
  abortSignal: AbortSignal;
  assistantMessageId: string;
  lifecycle: AssistantMessageLifecycle;
  modelMessages: ModelMessage[];
  sources: AdvisorSource[];
  systemPrompt: string;
  writer: UIMessageStreamWriterWithOutcome<UIMessage>;
}

function getErrorLogContext(error: unknown): AdvisorErrorLogContext {
  if (RetryError.isInstance(error)) {
    return {
      ...getErrorLogContext(error.lastError),
      errorName: error.name,
      message: error.message,
      retryReason: error.reason,
    };
  }

  if (StreamProviderError.isInstance(error)) {
    return {
      code: error.code,
      errorName: error.name,
      isRetryable: error.isRetryable,
      message: error.message,
      statusCode: error.statusCode,
    };
  }

  if (APICallError.isInstance(error)) {
    return {
      errorName: error.name,
      isRetryable: error.isRetryable,
      message: error.message,
      statusCode: error.statusCode,
    };
  }

  if (error instanceof Error) {
    return {
      errorName: error.name,
      message: error.message,
    };
  }

  return {
    errorName: "UnknownError",
    message: String(error),
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
    .slice(-ADVISOR_RETRIEVAL_CONFIG.userMessageQueryLimit)
    .map(getTextContent)
    .filter(Boolean)
    .join("\n");
}

async function loadValidatedModelHistory(chatId: number): Promise<UIMessage[]> {
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

  return validation.data.slice(-ADVISOR_MODEL_CONFIG.historyMessageLimit);
}

function getPlainTextParts(message: UIMessage): UIMessage["parts"] {
  return message.parts.filter(isTextUIPart).map(({ text }) => ({
    text,
    type: "text" as const,
  }));
}

function toTextOnlyModelHistory(messages: UIMessage[]): UIMessage[] {
  return messages
    .map((message) => ({
      ...message,
      parts: getPlainTextParts(message),
    }))
    .filter((message) => message.parts.length > 0);
}

function sanitizePersistedResponseParts(
  message: UIMessage
): UIMessage["parts"] {
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

async function saveSubmittedUserMessage(
  chatId: number,
  submittedMessage: SubmittedPondChatMessage
): Promise<void> {
  const [submittedTextPart] = submittedMessage.parts;
  const userParts = persistedMessagePartsSchema.parse(submittedMessage.parts);
  const savedUserMessage = await createUserMessage({
    chatId,
    content: submittedTextPart.text,
    messageId: submittedMessage.id,
    parts: userParts,
  });

  if (savedUserMessage.created) {
    return;
  }

  const hasConflictingContent =
    savedUserMessage.message.role !== "user" ||
    savedUserMessage.message.content !== submittedTextPart.text;

  if (hasConflictingContent) {
    throw new ChatMessageConflictError(submittedMessage.id);
  }

  throw new ChatMessageAlreadySubmittedError(submittedMessage.id);
}

async function prepareAdvisorTurn(
  chatId: number,
  pondId: number
): Promise<PreparedAdvisorTurn> {
  const history = await loadValidatedModelHistory(chatId);
  const retrievalQuery = buildRetrievalQuery(history);
  const sources = await retrieveAdvisorSources(pondId, retrievalQuery);
  const systemPrompt = buildAdvisorSystemPrompt(sources);
  const modelMessages = await convertToModelMessages(
    toTextOnlyModelHistory(history)
  );

  return { history, modelMessages, sources, systemPrompt };
}

function createAssistantMessageLifecycle({
  assistantMessageRowId,
  chatId,
  releaseOperation,
  sources,
}: CreateAssistantMessageLifecycleInput): AssistantMessageLifecycle {
  let finalStatus: AssistantMessageFinalStatus | undefined;

  const markIncomplete = async (
    status: IncompleteAssistantMessageStatus
  ): Promise<void> => {
    if (finalStatus) {
      return;
    }

    finalStatus = status;
    await markAssistantMessageIncomplete(assistantMessageRowId, status);
  };

  const finalize = async ({
    isAborted,
    outcome,
    responseMessage,
  }: FinalizeAssistantMessageInput): Promise<void> => {
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
        sanitizePersistedResponseParts(responseMessage)
      );

      try {
        await completeAssistantMessage({
          chatId,
          content: getTextContent(responseMessage),
          messageRowId: assistantMessageRowId,
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
  };

  return {
    finalize,
    markAborted: async () => await markIncomplete("aborted"),
    markFailed: async () => await markIncomplete("failed"),
  };
}

function writeAdvisorModelStream({
  abortSignal,
  assistantMessageId,
  lifecycle,
  modelMessages,
  sources,
  systemPrompt,
  writer,
}: WriteAdvisorModelStreamInput): void {
  writer.write({
    messageId: assistantMessageId,
    type: "start",
  });

  for (const source of sources) {
    writer.write({
      mediaType: ANALYSIS_SOURCE_PROTOCOL.mediaType,
      sourceId: source.sourceKey,
      title: formatAdvisorSourceTitle(source),
      type: "source-document",
    });
  }

  const result = streamText({
    abortSignal,
    maxOutputTokens: ADVISOR_MODEL_CONFIG.maxOutputTokens,
    messages: modelMessages,
    model: openai(ADVISOR_MODEL_CONFIG.model),
    onAbort: lifecycle.markAborted,
    onError: ({ error }) => {
      console.warn(
        "Advisor model stream attempt failed",
        getErrorLogContext(error)
      );
    },
    providerOptions: {
      openai: {
        reasoningEffort: ADVISOR_MODEL_CONFIG.reasoningEffort,
        reasoningSummary: ADVISOR_MODEL_CONFIG.reasoningSummary,
      },
    },
    streamRetries: ADVISOR_MODEL_CONFIG.streamRetryLimit,
    system: systemPrompt,
  });

  writer.merge(
    toUIMessageStream({
      onError: (error) => {
        writer.setOutcome({ error, status: "failed" });
        console.error("Advisor model stream failed", getErrorLogContext(error));
        return SAFE_STREAM_ERROR_MESSAGE;
      },
      sendReasoning: true,
      sendSources: false,
      sendStart: false,
      stream: result.stream,
    })
  );
}

async function createAdvisorMessageStreamResponse(
  chatId: number,
  pondId: number,
  submittedMessage: SubmittedPondChatMessage,
  abortSignal: AbortSignal,
  releaseOperation: () => void
): Promise<Response> {
  await saveSubmittedUserMessage(chatId, submittedMessage);
  const preparedTurn = await prepareAdvisorTurn(chatId, pondId);
  const assistantMessage = await createPendingAssistantMessage(
    chatId,
    crypto.randomUUID()
  );
  const lifecycle = createAssistantMessageLifecycle({
    assistantMessageRowId: assistantMessage.id,
    chatId,
    releaseOperation,
    sources: preparedTurn.sources,
  });

  const stream = createUIMessageStream<UIMessage>({
    execute: async ({ writer }) => {
      try {
        writeAdvisorModelStream({
          abortSignal,
          assistantMessageId: assistantMessage.messageId,
          lifecycle,
          modelMessages: preparedTurn.modelMessages,
          sources: preparedTurn.sources,
          systemPrompt: preparedTurn.systemPrompt,
          writer,
        });
      } catch (error) {
        await lifecycle.markFailed();
        throw error;
      }
    },
    onEnd: async ({ isAborted, outcome, responseMessage }) => {
      await lifecycle.finalize({ isAborted, outcome, responseMessage });
    },
    onError: (error) => {
      console.error(
        "Advisor chat stream processing failed",
        getErrorLogContext(error)
      );
      releaseOperation();
      return SAFE_STREAM_ERROR_MESSAGE;
    },
    originalMessages: preparedTurn.history,
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
    const chat = await getOrCreatePondChat(pondId);
    return await createAdvisorMessageStreamResponse(
      chat.id,
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
