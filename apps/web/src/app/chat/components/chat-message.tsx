import { isTextUIPart, type UIMessage } from "ai";
import { LoaderCircleIcon } from "lucide-react";
import type { ComponentProps } from "react";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  type AnalysisSource,
  createAnalysisCitationPlugin,
  createAnalysisSourceMap,
  getCitationSourceIdFromHref,
} from "../utils/citations";
import { AnalysisCitation, AnalysisSources } from "./analysis-citation";

interface ChatMessageProps {
  isStreaming: boolean;
  message: UIMessage;
}

type CitationAnchorProps = ComponentProps<"a"> & { node?: unknown };

const createCitationAnchor = (sources: ReadonlyMap<string, AnalysisSource>) => {
  const CitationAnchor = ({
    children,
    href,
    node: _node,
    ...props
  }: CitationAnchorProps) => {
    const sourceId = getCitationSourceIdFromHref(href);
    const source = sourceId ? sources.get(sourceId) : undefined;

    if (source) {
      return <AnalysisCitation source={source} />;
    }

    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  };

  CitationAnchor.displayName = "CitationAnchor";
  return CitationAnchor;
};

export const ChatMessage = ({ isStreaming, message }: ChatMessageProps) => {
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
  const sourceMap = createAnalysisSourceMap(message.parts);
  const sources = Array.from(sourceMap.values());
  const isAssistant = message.role === "assistant";
  const components = isAssistant
    ? { a: createCitationAnchor(sourceMap) }
    : undefined;
  const remarkPlugins = isAssistant
    ? [createAnalysisCitationPlugin(sourceMap)]
    : undefined;

  return (
    <Message aria-label={`Mensagem de ${author}`} from={message.role}>
      <span className="sr-only">{author}</span>
      <MessageContent>
        {text ? (
          <>
            <MessageResponse
              components={components}
              isAnimating={isStreaming}
              remarkPlugins={remarkPlugins}
            >
              {text}
            </MessageResponse>
            {isAssistant && <AnalysisSources sources={sources} />}
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
};
