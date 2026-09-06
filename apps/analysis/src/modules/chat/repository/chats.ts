import { chats, db, ponds } from "database";
import { eq } from "drizzle-orm";

export async function pondExists(pondId: number): Promise<boolean> {
  const result = await db
    .select({ id: ponds.id })
    .from(ponds)
    .where(eq(ponds.id, pondId))
    .limit(1);

  return result.length > 0;
}

export async function findChatByPondId(pondId: number) {
  const result = await db
    .select()
    .from(chats)
    .where(eq(chats.pondId, pondId))
    .limit(1);

  return result[0];
}

export async function createOrGetChatForPond(pondId: number, title: string) {
  const createdChats = await db
    .insert(chats)
    .values({ pondId, title })
    .onConflictDoNothing({ target: chats.pondId })
    .returning();
  const chat = createdChats[0] ?? (await findChatByPondId(pondId));

  if (!chat) {
    throw new Error("Failed to create or load the pond chat");
  }

  return chat;
}
