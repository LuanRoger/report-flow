import { AlertCircle, ChartNoAxesColumn, Eye } from "lucide-react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTimeMed } from "@/lib/utils/date";
import { getAnalysesByPondAction } from "../../actions";
import type { AnalysisListItem } from "../../actions/types";

const scoreFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

const getScoreBadgeVariant = (
  score: number
): "default" | "secondary" | "destructive" => {
  if (score >= 80) {
    return "default";
  }

  if (score >= 60) {
    return "secondary";
  }

  return "destructive";
};

const AnalysisRow = ({ analysis }: { analysis: AnalysisListItem }) => (
  <TableRow>
    <TableCell className="font-medium tabular-nums">#{analysis.id}</TableCell>
    <TableCell>{formatDateTimeMed(analysis.createdAt)}</TableCell>
    <TableCell>
      <div className="flex flex-col">
        <span>{formatDateTimeMed(analysis.startTime)}</span>
        <span className="text-muted-foreground text-xs">
          até {formatDateTimeMed(analysis.endTime)}
        </span>
      </div>
    </TableCell>
    <TableCell className="tabular-nums">
      {analysis.cycleId ? `#${analysis.cycleId}` : "—"}
    </TableCell>
    <TableCell>
      <Badge variant={getScoreBadgeVariant(analysis.finalScore)}>
        {scoreFormatter.format(analysis.finalScore)}
      </Badge>
    </TableCell>
    <TableCell className="text-right">
      <Button asChild size="sm" variant="outline">
        <Link href={`/analysis/${analysis.id}`}>
          <Eye data-icon="inline-start" />
          Ver detalhes
        </Link>
      </Button>
    </TableCell>
  </TableRow>
);

interface AnalysisListProps {
  pondId: number;
}

export default async function AnalysisList({ pondId }: AnalysisListProps) {
  const { data, serverError } = await getAnalysesByPondAction({ pondId });

  if (serverError || !data) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>Não foi possível carregar as análises</AlertTitle>
        <AlertDescription>
          Tente novamente em instantes. {serverError ?? "Resposta inválida."}
        </AlertDescription>
      </Alert>
    );
  }

  if (data.length === 0) {
    return (
      <Empty className="min-h-72 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ChartNoAxesColumn />
          </EmptyMedia>
          <EmptyTitle>Nenhuma análise encontrada</EmptyTitle>
          <EmptyDescription>
            O viveiro {pondId} ainda não possui análises registradas.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <section aria-labelledby="analysis-list-heading" className="space-y-3">
      <div>
        <h2
          className="font-heading font-medium text-lg"
          id="analysis-list-heading"
        >
          Histórico do viveiro {pondId}
        </h2>
        <p className="text-muted-foreground text-sm">
          {data.length} {data.length === 1 ? "análise" : "análises"}, da mais
          recente para a mais antiga.
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table>
          <TableCaption className="sr-only">
            Análises registradas para o viveiro {pondId}
          </TableCaption>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead>Análise</TableHead>
              <TableHead>Criada em</TableHead>
              <TableHead>Período analisado</TableHead>
              <TableHead>Ciclo</TableHead>
              <TableHead>Nota final</TableHead>
              <TableHead>
                <span className="sr-only">Ações</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((analysis) => (
              <AnalysisRow analysis={analysis} key={analysis.id} />
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
