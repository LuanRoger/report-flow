import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { PersistedMessagePart } from "../types";
import { chats } from "./chats";

export const messageRoles = ["user", "assistant"] as const;
export const messageStatuses = [
  "streaming",
  "completed",
  "failed",
  "aborted",
] as const;

export const messageRole = pgEnum("message_role", messageRoles);
export const messageStatus = pgEnum("message_status", messageStatuses);

export const messages = pgTable(
  "messages",
  {
    chatId: integer("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    id: serial("id").primaryKey(),
    messageId: text("message_id").notNull(),
    parts: jsonb("parts").$type<PersistedMessagePart[]>().notNull(),
    role: messageRole("role").notNull(),
    status: messageStatus("status").notNull().default("completed"),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("messages_chat_message_id_unique").on(
      table.chatId,
      table.messageId
    ),
    index("messages_chat_history_idx").on(
      table.chatId,
      table.createdAt,
      table.id
    ),
    index("messages_created_at_idx").on(table.createdAt),
  ]
);
