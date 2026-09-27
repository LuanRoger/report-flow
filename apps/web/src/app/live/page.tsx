import { Activity } from "lucide-react";
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
import LiveDashboard from "./components/live-dashboard";
import { loadSearchParams } from "./query";

const SelectorFallback = () => <Skeleton className="h-8 w-56" />;

export default async function LivePage({ searchParams }: PageProps<"/live">) {
  const { pondId } = await loadSearchParams(searchParams);
  const canShowLiveDashboard = pondId !== null && pondId >= 1;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading font-semibold text-2xl tracking-tight">
          Monitoramento ao vivo
        </h1>
        <p className="text-muted-foreground text-sm">
          Acompanhe as condições mais recentes da água de um viveiro.
        </p>
      </header>

      <section aria-labelledby="live-pond-selection" className="space-y-2">
        <div>
          <h2 className="font-medium text-sm" id="live-pond-selection">
            Viveiro
          </h2>
          <p className="text-muted-foreground text-sm">
            Selecione um viveiro para iniciar o monitoramento.
          </p>
        </div>
        <Suspense fallback={<SelectorFallback />}>
          <PondsCyclesSelector hideCycles pondId={pondId} />
        </Suspense>
      </section>

      {canShowLiveDashboard ? (
        <LiveDashboard pondId={pondId} />
      ) : (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Activity />
            </EmptyMedia>
            <EmptyTitle>Selecione um viveiro</EmptyTitle>
            <EmptyDescription>
              Os gráficos com as medições mais recentes aparecerão aqui após a
              seleção.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}
