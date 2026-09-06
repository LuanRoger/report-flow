import type { UIMessage } from "ai";
import { BotIcon, LoaderCircleIcon } from "lucide-react";
import { INITIAL_CHAT_SUGGESTED_QUESTIONS } from "@/app/chat/constants";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import ChatMessage from "./components/chat-message";
import Suggestions from "./components/suggestions";

interface ChatConversationProps {
  disableSuggestions?: boolean;
  isStreaming: boolean;
  isSubmitted?: boolean;
  messages: UIMessage[];
  onSuggestionSelect: (suggestion: string) => void;
}

export default function ChatConversation({
  disableSuggestions,
  isStreaming,
  isSubmitted,
  messages,
  onSuggestionSelect,
}: ChatConversationProps) {
  return (
    <Conversation>
      <ConversationContent className="mx-auto min-h-full w-full max-w-3xl gap-6 px-4 py-8 sm:px-6">
        {messages.length === 0 ? (
          <ConversationEmptyState className="min-h-[60vh] px-0">
            <div className="flex max-w-xl flex-col items-center gap-5 text-center">
              <div className="rounded-full bg-primary/10 p-3 text-primary">
                <BotIcon className="size-6" />
              </div>
              <div className="space-y-2">
                <h2 className="font-semibold text-lg">
                  Como posso ajudar com o viveiro?
                </h2>
                <p className="text-balance text-muted-foreground text-sm">
                  Pergunte sobre as análises de qualidade da água ou peça
                  orientações gerais de manejo aquícola.
                </p>
              </div>
              <Suggestions
                disabled={disableSuggestions}
                onSelect={onSuggestionSelect}
                suggestions={INITIAL_CHAT_SUGGESTED_QUESTIONS}
              />
            </div>
          </ConversationEmptyState>
        ) : (
          messages.map((message, index) => (
            <ChatMessage
              isLastMessage={index === messages.length - 1}
              isStreaming={isStreaming}
              key={message.id}
              message={message}
            />
          ))
        )}

        {isSubmitted && (
          <Message from="assistant">
            <MessageContent>
              <span className="flex items-center gap-2 text-muted-foreground">
                <LoaderCircleIcon className="size-4 animate-spin" />
                Preparando a resposta…
              </span>
            </MessageContent>
          </Message>
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
