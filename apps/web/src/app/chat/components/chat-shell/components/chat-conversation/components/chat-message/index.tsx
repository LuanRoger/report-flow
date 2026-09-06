import { isReasoningUIPart, isTextUIPart, type UIMessage } from "ai";
import { LoaderCircleIcon } from "lucide-react";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import AnalysisSources from "./components/analysis-citation";
import { getReasoningMessage } from "./utils";

interface ChatMessageProps {
  isLastMessage: boolean;
  isStreaming: boolean;
  message: UIMessage;
}

export default function ChatMessage({
  isLastMessage,
  isStreaming,
  message,
}: ChatMessageProps) {
  if (message.role === "system") {
    return null;
  }

  const text = message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("");
  const reasoningParts = message.parts.filter(isReasoningUIPart);
  const reasoningText = reasoningParts.map((part) => part.text).join("\n\n");
  const hasReasoning = reasoningParts.length > 0;
  const isCurrentMessageStreaming = isLastMessage && isStreaming;

  if (!(text || hasReasoning || isCurrentMessageStreaming)) {
    return null;
  }

  const author = message.role === "user" ? "Você" : "Consultor";
  const isAssistant = message.role === "assistant";
  const lastPart = message.parts.at(-1);
  const isReasoningStreaming =
    isAssistant && isCurrentMessageStreaming && lastPart?.type === "reasoning";
  const isTextStreaming =
    isAssistant && isCurrentMessageStreaming && lastPart?.type === "text";

  return (
    <Message aria-label={`Mensagem de ${author}`} from={message.role}>
      <span className="sr-only">{author}</span>
      <MessageContent>
        {isAssistant && hasReasoning && (
          <Reasoning className="mb-2 w-full" isStreaming={isReasoningStreaming}>
            <ReasoningTrigger getThinkingMessage={getReasoningMessage} />
            <ReasoningContent>{reasoningText}</ReasoningContent>
          </Reasoning>
        )}
        {text ? (
          <>
            <MessageResponse isAnimating={isTextStreaming}>
              {text}
            </MessageResponse>
            {isAssistant && <AnalysisSources parts={message.parts} />}
          </>
        ) : (
          !hasReasoning && (
            <span className="flex items-center gap-2 text-muted-foreground">
              <LoaderCircleIcon className="size-4 animate-spin" />
              Consultando as análises do viveiro…
            </span>
          )
        )}
      </MessageContent>
    </Message>
  );
}
