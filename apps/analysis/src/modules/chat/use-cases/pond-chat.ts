import { ChatPondNotFoundError, PondChatNotFoundError } from "../models/errors";
import {
  createOrGetChatForPond,
  findChatByPondId,
  pondExists,
} from "../repository/chats";
import {
  clearMessagesByChatId,
  listMessagesByChatId,
} from "../repository/messages";
import { acquirePondChatOperation } from "../stores/operations";

const DEFAULT_CHAT_TITLE = "Consultor de qualidade da água";

async function ensurePondExists(pondId: number): Promise<void> {
  const pondIsPresent = await pondExists(pondId);
  if (!pondIsPresent) {
    throw new ChatPondNotFoundError(pondId);
  }
}

export async function getOrCreatePondChat(pondId: number) {
  await ensurePondExists(pondId);

  return await createOrGetChatForPond(pondId, DEFAULT_CHAT_TITLE);
}

export async function getPondChatHistory(pondId: number) {
  await ensurePondExists(pondId);

  const chat = await findChatByPondId(pondId);
  if (!chat) {
    throw new PondChatNotFoundError(pondId);
  }

  const persistedMessages = await listMessagesByChatId(chat.id);
  const messages = persistedMessages.map((message) => ({
    createdAt: message.createdAt,
    id: message.messageId,
    parts: message.parts,
    role: message.role,
    status: message.status,
    updatedAt: message.updatedAt,
  }));

  return { chat, messages };
}

export async function clearPondChatHistory(pondId: number) {
  const releaseOperation = await acquirePondChatOperation(pondId, "clearing");

  try {
    await ensurePondExists(pondId);

    const chat = await findChatByPondId(pondId);
    if (!chat) {
      return { clearedMessages: 0 };
    }

    const clearedMessages = await clearMessagesByChatId(chat.id);
    return { clearedMessages };
  } finally {
    releaseOperation();
  }
}
