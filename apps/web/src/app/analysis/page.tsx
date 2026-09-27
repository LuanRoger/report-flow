import { Waves } from "lucide-react";
import { Suspense } from "react";
import PondsCyclesSelector from "@/components/ponds-cycles-selector";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import AnalysisList from "./components/analysis-list";
import { loadSearchParams } from "./query";

const SelectorFallback = () => <Skeleton className="h-8 w-56" />;

const ListFallback = () => (
  <div className="space-y-3" role="status">
    <div className="space-y-2">
      <Skeleton className="h-6 w-56" />
      <Skeleton className="h-4 w-72 max-w-full" />
    </div>
    <Skeleton className="h-80 rounded-xl" />
    <span className="sr-only">Carregando análises</span>
  </div>
);

export default async function AnalysisPage({
  searchParams,
}: PageProps<"/analysis">) {
  const { pondId } = await loadSearchParams(searchParams);
  const hasValidPond = pondId !== null && pondId >= 1;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading font-semibold text-2xl tracking-tight">
          Análises
        </h1>
        <p className="text-muted-foreground text-sm">
          Consulte o histórico de qualidade da água de um viveiro.
        </p>
      </header>

      <section aria-labelledby="pond-selection-heading" className="space-y-2">
        <div>
          <h2 className="font-medium text-sm" id="pond-selection-heading">
            Viveiro
          </h2>
          <p className="text-muted-foreground text-sm">
            Selecione um viveiro para carregar suas análises.
          </p>
        </div>
        <Suspense fallback={<SelectorFallback />}>
          <PondsCyclesSelector hideCycles pondId={pondId} />
        </Suspense>
      </section>

      {hasValidPond ? (
        <Suspense fallback={<ListFallback />} key={pondId}>
          <AnalysisList pondId={pondId} />
        </Suspense>
      ) : (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Waves />
            </EmptyMedia>
            <EmptyTitle>Selecione um viveiro</EmptyTitle>
            <EmptyDescription>
              As análises registradas aparecerão aqui após a seleção.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}
