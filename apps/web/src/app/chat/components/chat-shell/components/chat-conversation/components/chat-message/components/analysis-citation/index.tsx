import type { SourceDocumentUIPart, UIMessage } from "ai";
import {
  BookOpenTextIcon,
  CalendarDaysIcon,
  ChevronDownIcon,
  RefreshCwIcon,
} from "lucide-react";
import {
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ai-elements/sources";

const ANALYSIS_SOURCE_MEDIA_TYPE = "application/vnd.report-flow.analysis";

type MessagePart = UIMessage["parts"][number];

const isAnalysisSource = (part: MessagePart): part is SourceDocumentUIPart =>
  part.type === "source-document" &&
  part.mediaType === ANALYSIS_SOURCE_MEDIA_TYPE;

interface AnalysisSourcesProps {
  parts: UIMessage["parts"];
}

export default function AnalysisSources({ parts }: AnalysisSourcesProps) {
  const sources = parts.filter(isAnalysisSource);

  if (sources.length === 0) {
    return null;
  }

  return (
    <Sources className="mt-3 mb-0 w-full text-muted-foreground">
      <SourcesTrigger
        className="group/source min-h-10 w-full justify-between rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/50"
        count={sources.length}
      >
        <span className="flex min-w-0 items-center gap-2 font-medium">
          <BookOpenTextIcon className="size-4 shrink-0" />
          <span className="truncate">Análises consultadas</span>
          <span aria-hidden="true">({sources.length})</span>
        </span>
        <ChevronDownIcon className="size-4 shrink-0 transition-transform group-data-[state=open]/source:rotate-180" />
      </SourcesTrigger>
      <SourcesContent className="w-full">
        <ol className="grid w-full gap-2">
          {sources.map((source) => (
            <li
              className="flex min-w-0 gap-3 rounded-md border bg-muted/30 p-3"
              key={source.sourceId}
            >
              <span className="flex h-6 shrink-0 items-center rounded-md bg-background px-2 font-semibold text-primary text-xs ring-1 ring-border">
                {source.sourceId}
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center gap-1.5 font-medium text-foreground text-xs">
                  <CalendarDaysIcon className="size-3.5" />
                  Análise de qualidade da água
                </div>
                <p className="wrap-break-words text-muted-foreground text-xs leading-relaxed">
                  {source.title}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <RefreshCwIcon className="size-3.5" />
          As fontes são específicas desta resposta.
        </p>
      </SourcesContent>
    </Sources>
  );
}
