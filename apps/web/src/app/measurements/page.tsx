import { TableProperties, Waves } from "lucide-react";
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
import MeasurementsTable from "./components/measurements-table";
import { loadSearchParams } from "./query";

const SelectorFallback = () => <Skeleton className="h-8 w-full max-w-md" />;

export default async function MeasurementsPage({
  searchParams,
}: PageProps<"/measurements">) {
  const { cycleId, pondId, cursor } = await loadSearchParams(searchParams);
  const hasValidPond = pondId !== null && pondId >= 1;
  const hasValidCycle = cycleId !== null && cycleId >= 1;
  const canShowTable = hasValidPond && hasValidCycle;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading font-semibold text-2xl tracking-tight">
          Histórico de medições
        </h1>
        <p className="text-muted-foreground text-sm">
          Consulte as medições registradas durante um ciclo de cultivo.
        </p>
      </header>

      <section
        aria-labelledby="measurement-selection-heading"
        className="space-y-2"
      >
        <div>
          <h2
            className="font-medium text-sm"
            id="measurement-selection-heading"
          >
            Viveiro e ciclo
          </h2>
          <p className="text-muted-foreground text-sm">
            Selecione um viveiro e um ciclo para carregar o histórico.
          </p>
        </div>
        <Suspense fallback={<SelectorFallback />}>
          <PondsCyclesSelector pondId={pondId} />
        </Suspense>
      </section>

      {canShowTable ? (
        <MeasurementsTable cursor={cursor} cycleId={cycleId} />
      ) : (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {hasValidPond ? <TableProperties /> : <Waves />}
            </EmptyMedia>
            <EmptyTitle>
              {hasValidPond
                ? "Selecione um ciclo"
                : "Selecione um viveiro e um ciclo"}
            </EmptyTitle>
            <EmptyDescription>
              {hasValidPond
                ? `Escolha um ciclo do viveiro ${pondId} para visualizar suas medições.`
                : "O histórico de medições aparecerá aqui após a seleção."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}
