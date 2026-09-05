import type { UIMessage } from "ai";

export function removeIncompleteAssistant(messages: UIMessage[]): UIMessage[] {
  return messages.at(-1)?.role === "assistant"
    ? messages.slice(0, -1)
    : messages;
}
