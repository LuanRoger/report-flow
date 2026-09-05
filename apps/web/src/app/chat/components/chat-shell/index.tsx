"use client";
import type { UIMessage } from "ai";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { useAiChat } from "@/hooks/use-ai-chat";
import { ADVISOR_MESSAGE_CHARACTER_LIMIT } from "../../constants";
import ChatConversation from "./components/chat-conversation";
import ClearHistoryButton from "./components/clear-history-button";
import ChatHeader from "./components/hearder";

interface ChatShellProps {
  chatId: number;
  initialMessages: UIMessage[];
  pondId: number;
  title: string;
}

export const ChatShell = ({
  chatId,
  initialMessages,
  pondId,
  title,
}: ChatShellProps) => {
  const {
    handleClearHistory,
    handleInputChange,
    handleStop,
    handleSubmit,
    handleSuggestionSelect,
    input,
    isClearingHistory,
    isGenerating,
    isInteractionBlocked,
    messages,
    status,
  } = useAiChat({ chatId, initialMessages, pondId });

  const disableInputSubmit =
    isClearingHistory || status === "error" || !(isGenerating || input.trim());
  const isSubmitted = status === "submitted";
  const isStreaming = status === "streaming";

  return (
    <section className="flex size-full min-h-0 flex-col">
      <ChatHeader
        pondId={pondId}
        title={title}
        trailing={
          <ClearHistoryButton
            disabled={isGenerating || messages.length === 0}
            isClearing={isClearingHistory}
            onConfirmAction={handleClearHistory}
          />
        }
      />

      <ChatConversation
        disableSuggestions={isInteractionBlocked}
        isStreaming={isStreaming}
        isSubmitted={isSubmitted}
        messages={messages}
        onSuggestionSelect={handleSuggestionSelect}
      />

      <footer className="shrink-0 border-t bg-background px-4 py-3 sm:px-6 sm:py-4">
        <div className="mx-auto w-full max-w-3xl space-y-3">
          <PromptInput maxFiles={0} onSubmit={handleSubmit}>
            <PromptInputTextarea
              disabled={isInteractionBlocked}
              maxLength={ADVISOR_MESSAGE_CHARACTER_LIMIT}
              onChange={handleInputChange}
              placeholder="Pergunte sobre a qualidade da água ou o manejo do viveiro"
              value={input}
            />
            <PromptInputFooter>
              <span className="text-muted-foreground text-xs">
                {input.length}/{ADVISOR_MESSAGE_CHARACTER_LIMIT}
              </span>
              <PromptInputSubmit
                disabled={disableInputSubmit}
                onStop={handleStop}
                status={status}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </footer>
    </section>
  );
};
