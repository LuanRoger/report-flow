import { isTextUIPart, type UIMessage } from "ai";
import { LoaderCircleIcon } from "lucide-react";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import AnalysisSources from "./components/analysis-citation";

interface ChatMessageProps {
  isStreaming: boolean;
  message: UIMessage;
}

export default function ChatMessage({
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

  if (!(text || isStreaming)) {
    return null;
  }

  const author = message.role === "user" ? "Você" : "Consultor";
  const isAssistant = message.role === "assistant";

  return (
    <Message aria-label={`Mensagem de ${author}`} from={message.role}>
      <span className="sr-only">{author}</span>
      <MessageContent>
        {text ? (
          <>
            <MessageResponse isAnimating={isStreaming}>{text}</MessageResponse>
            {isAssistant && <AnalysisSources parts={message.parts} />}
          </>
        ) : (
          <span className="flex items-center gap-2 text-muted-foreground">
            <LoaderCircleIcon className="size-4 animate-spin" />
            Consultando as análises do viveiro…
          </span>
        )}
      </MessageContent>
    </Message>
  );
}
