"use client";

import {
  BookOpenTextIcon,
  CalendarDaysIcon,
  ChevronDownIcon,
  RefreshCwIcon,
} from "lucide-react";
import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardBody,
  InlineCitationSource,
} from "@/components/ai-elements/inline-citation";
import {
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ai-elements/sources";
import { HoverCardTrigger } from "@/components/ui/hover-card";
import type { AnalysisSource } from "../utils/citations";

const ANALYSIS_DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "medium",
  timeZone: "UTC",
});

const formatAnalysisDate = (date: string): string =>
  ANALYSIS_DATE_FORMATTER.format(new Date(date));

interface AnalysisSourceDetailsProps {
  source: AnalysisSource;
}

const AnalysisSourceDetails = ({ source }: AnalysisSourceDetailsProps) => {
  const { analysisCreatedAt, cycle, periodEnd, periodStart } = source.metadata;

  return (
    <dl className="grid gap-1.5 text-xs">
      <div className="flex gap-2">
        <dt className="shrink-0 font-medium text-foreground">
          Data da análise:
        </dt>
        <dd className="text-muted-foreground">
          {formatAnalysisDate(analysisCreatedAt)}
        </dd>
      </div>
      <div className="flex flex-wrap gap-x-2">
        <dt className="shrink-0 font-medium text-foreground">
          Período avaliado:
        </dt>
        <dd className="text-muted-foreground">
          {formatAnalysisDate(periodStart)} a {formatAnalysisDate(periodEnd)}
        </dd>
      </div>
      <div className="flex gap-2">
        <dt className="shrink-0 font-medium text-foreground">Ciclo:</dt>
        <dd className="text-muted-foreground">{cycle ?? "Não informado"}</dd>
      </div>
    </dl>
  );
};

interface AnalysisCitationProps {
  source: AnalysisSource;
}

export const AnalysisCitation = ({ source }: AnalysisCitationProps) => (
  <InlineCitation>
    <InlineCitationCard>
      <HoverCardTrigger asChild>
        <button
          aria-label={`Ver detalhes da fonte ${source.sourceId}`}
          className="mx-0.5 inline-flex h-5 items-center rounded-md border border-primary/20 bg-primary/10 px-1.5 font-semibold text-[0.7rem] text-primary leading-none transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          type="button"
        >
          [{source.sourceId}]
        </button>
      </HoverCardTrigger>
      <InlineCitationCardBody
        align="start"
        className="w-[min(20rem,calc(100vw-2rem))] p-4"
      >
        <InlineCitationSource title={`Fonte ${source.sourceId}`}>
          <AnalysisSourceDetails source={source} />
        </InlineCitationSource>
      </InlineCitationCardBody>
    </InlineCitationCard>
  </InlineCitation>
);

interface AnalysisSourcesProps {
  sources: AnalysisSource[];
}

export const AnalysisSources = ({ sources }: AnalysisSourcesProps) => {
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
                <AnalysisSourceDetails source={source} />
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
};
