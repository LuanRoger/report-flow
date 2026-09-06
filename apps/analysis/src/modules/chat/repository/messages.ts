import type { PersistedMessagePart } from "database";
import { chats, db, messageSources, messages } from "database";
import { and, asc, eq } from "drizzle-orm";

export interface CreateUserMessageInput {
  chatId: number;
  content: string;
  messageId: string;
  parts: PersistedMessagePart[];
}

export interface PersistedAdvisorSourceInput {
  analysisCreatedAt: Date;
  analysisId: number;
  cycleId: number | null;
  periodEnd: Date;
  periodStart: Date;
  rank: number;
  similarity: number | null;
  sourceKey: string;
}

export interface CompleteAssistantMessageInput {
  chatId: number;
  content: string;
  messageRowId: number;
  parts: PersistedMessagePart[];
  sources: PersistedAdvisorSourceInput[];
}

export type IncompleteAssistantMessageStatus = "aborted" | "failed";

export async function listMessagesByChatId(chatId: number) {
  return await db
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.createdAt), asc(messages.id));
}

export async function clearMessagesByChatId(chatId: number): Promise<number> {
  return await db.transaction(async (transaction) => {
    const deletedMessages = await transaction
      .delete(messages)
      .where(eq(messages.chatId, chatId))
      .returning({ id: messages.id });

    await transaction
      .update(chats)
      .set({ updatedAt: new Date() })
      .where(eq(chats.id, chatId));

    return deletedMessages.length;
  });
}

export async function findMessageByChatAndMessageId(
  chatId: number,
  messageId: string
) {
  const [message] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.chatId, chatId), eq(messages.messageId, messageId)))
    .limit(1);

  return message;
}

export async function createUserMessage(input: CreateUserMessageInput) {
  const [insertedMessage] = await db
    .insert(messages)
    .values({
      chatId: input.chatId,
      content: input.content,
      messageId: input.messageId,
      parts: input.parts,
      role: "user",
      status: "completed",
    })
    .onConflictDoNothing({
      target: [messages.chatId, messages.messageId],
    })
    .returning();

  if (insertedMessage) {
    return { created: true as const, message: insertedMessage };
  }

  const existingMessage = await findMessageByChatAndMessageId(
    input.chatId,
    input.messageId
  );
  if (!existingMessage) {
    throw new Error("Failed to create or load the user message");
  }

  return { created: false as const, message: existingMessage };
}

export async function createPendingAssistantMessage(
  chatId: number,
  messageId: string
) {
  const [message] = await db
    .insert(messages)
    .values({
      chatId,
      content: "",
      messageId,
      parts: [],
      role: "assistant",
      status: "streaming",
    })
    .returning();

  if (!message) {
    throw new Error("Failed to create the assistant message");
  }

  return message;
}

export async function completeAssistantMessage(
  input: CompleteAssistantMessageInput
): Promise<void> {
  await db.transaction(async (transaction) => {
    const now = new Date();
    const updatedMessages = await transaction
      .update(messages)
      .set({
        content: input.content,
        parts: input.parts,
        status: "completed",
        updatedAt: now,
      })
      .where(eq(messages.id, input.messageRowId))
      .returning({ id: messages.id });

    if (updatedMessages.length === 0) {
      throw new Error("Failed to complete the assistant message");
    }

    await transaction
      .delete(messageSources)
      .where(eq(messageSources.messageRowId, input.messageRowId));

    if (input.sources.length > 0) {
      await transaction.insert(messageSources).values(
        input.sources.map((source) => ({
          analysisCreatedAt: source.analysisCreatedAt,
          analysisCycleId: source.cycleId,
          analysisId: source.analysisId,
          messageRowId: input.messageRowId,
          periodEnd: source.periodEnd,
          periodStart: source.periodStart,
          rank: source.rank,
          similarity: source.similarity,
          sourceKey: source.sourceKey,
        }))
      );
    }

    await transaction
      .update(chats)
      .set({ updatedAt: now })
      .where(eq(chats.id, input.chatId));
  });
}

export async function markAssistantMessageIncomplete(
  messageRowId: number,
  status: IncompleteAssistantMessageStatus
): Promise<void> {
  await db
    .update(messages)
    .set({ status, updatedAt: new Date() })
    .where(eq(messages.id, messageRowId));
}
