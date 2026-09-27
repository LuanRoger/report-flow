import {
  AlertCircle,
  ArrowLeft,
  Bot,
  CalendarRange,
  CheckCircle2,
  CircleGauge,
  Database,
  FlaskConical,
  Info,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { getAnalysisByIdAction } from "@/app/analysis/actions";
import {
  PARAMETER_CODES,
  PARAMETER_DEFINITIONS,
} from "@/app/analysis/constants";
import type { AnalysisChartDatum, ParameterCode } from "@/app/analysis/types";
import {
  formatDecimal,
  formatDuration,
  formatPercentage,
  getScoreBadgeVariant,
} from "@/app/analysis/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTimeMed } from "@/lib/utils/date";
import AnalysisBarChart from "./components/analysis-charts";
import ParameterDetails from "./components/parameter-details";

export const metadata: Metadata = {
  title: "Detalhes da análise | Report Flow",
};

const OverviewCard = ({
  description,
  icon,
  label,
  value,
}: {
  description: string;
  icon: ReactNode;
  label: string;
  value: string;
}) => (
  <Card size="sm">
    <CardHeader>
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <CardTitle className="font-semibold text-2xl tabular-nums">
        {value}
      </CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
  </Card>
);

const DetailItem = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className="text-muted-foreground text-xs">{label}</dt>
    <dd className="font-medium tabular-nums">{value}</dd>
  </div>
);

const DetailsFallback = () => (
  <div className="space-y-6" role="status">
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-2">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-8 w-28" />
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Skeleton className="h-32 rounded-xl" />
      <Skeleton className="h-32 rounded-xl" />
      <Skeleton className="h-32 rounded-xl" />
      <Skeleton className="h-32 rounded-xl" />
    </div>
    <div className="grid gap-4 xl:grid-cols-2">
      <Skeleton className="h-96 rounded-xl" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
    <span className="sr-only">Carregando detalhes da análise</span>
  </div>
);

async function AnalysisDetails({ analysisId }: { analysisId: number }) {
  const { data: analysis, serverError } = await getAnalysisByIdAction({
    analysisId,
  });

  if (serverError) {
    return (
      <div className="space-y-4">
        <Button asChild size="sm" variant="outline">
          <Link href="/analysis">
            <ArrowLeft data-icon="inline-start" />
            Voltar
          </Link>
        </Button>
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Não foi possível carregar a análise</AlertTitle>
          <AlertDescription>
            Tente novamente em instantes. {serverError}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!analysis) {
    notFound();
  }

  const {
    dataCoverage,
    measurementsByParameter,
    timeRange,
    totalMeasurements,
  } = analysis.metadata.executionStats;
  const parameterScores: Record<ParameterCode, number> = {
    dissolvedOxygen: analysis.dissolvedOxygenScore,
    ph: analysis.phScore,
    salinity: analysis.salinityScore,
    temperature: analysis.temperatureScore,
  };
  const chartData: AnalysisChartDatum[] = PARAMETER_CODES.map(
    (parameterCode) => ({
      coverage:
        dataCoverage.parameterCoverage[parameterCode].coveragePercentage,
      parameter: PARAMETER_DEFINITIONS[parameterCode].shortLabel,
      score: parameterScores[parameterCode],
    })
  );
  const unfavorableIntervals = PARAMETER_CODES.flatMap((parameterCode) =>
    analysis.metadata.parameterStats[
      parameterCode
    ].temporalMetrics.unfavorableIntervals.map((interval) => ({
      ...interval,
      parameterCode,
    }))
  );
  const presentParameters = dataCoverage.presentParameters
    .map((code) => PARAMETER_DEFINITIONS[code].label)
    .join(", ");
  const missingParameters = dataCoverage.missingParameters
    .map((code) => PARAMETER_DEFINITIONS[code].label)
    .join(", ");

  return (
    <article className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="space-y-3">
          <Button asChild size="sm" variant="outline">
            <Link href={`/analysis?pondId=${analysis.pondId}`}>
              <ArrowLeft data-icon="inline-start" />
              Voltar para análises
            </Link>
          </Button>
          <div className="space-y-1">
            <h1 className="font-heading font-semibold text-2xl tracking-tight">
              Análise #{analysis.id}
            </h1>
            <p className="text-muted-foreground text-sm">
              Criada em {formatDateTimeMed(analysis.createdAt)} para o viveiro{" "}
              {analysis.pondId}.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Badge variant="outline">Viveiro {analysis.pondId}</Badge>
          <Badge variant="outline">
            {analysis.cycleId ? `Ciclo ${analysis.cycleId}` : "Sem ciclo"}
          </Badge>
          <Badge variant="secondary">
            Modelo {analysis.metadata.scoringModelVersion}
          </Badge>
        </div>
      </header>

      <section
        aria-label="Resumo da análise"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <OverviewCard
          description="Resultado ponderado dos quatro parâmetros"
          icon={<CircleGauge className="size-4" />}
          label="Nota final"
          value={formatDecimal(analysis.finalScore)}
        />
        <OverviewCard
          description={
            dataCoverage.hasSufficientCoverage
              ? "Todos os parâmetros atingiram a cobertura mínima"
              : "Um ou mais parâmetros estão abaixo do mínimo"
          }
          icon={
            dataCoverage.hasSufficientCoverage ? (
              <CheckCircle2 className="size-4" />
            ) : (
              <Info className="size-4" />
            )
          }
          label="Cobertura geral"
          value={formatPercentage(dataCoverage.coveragePercentage)}
        />
        <OverviewCard
          description="Amostras consideradas no cálculo"
          icon={<Database className="size-4" />}
          label="Medições"
          value={totalMeasurements.toLocaleString("pt-BR")}
        />
        <OverviewCard
          description={`${formatDateTimeMed(analysis.startTime)} até ${formatDateTimeMed(analysis.endTime)}`}
          icon={<CalendarRange className="size-4" />}
          label="Janela analisada"
          value={analysis.cycleId ? `Ciclo ${analysis.cycleId}` : "Período"}
        />
      </section>

      {dataCoverage.hasSufficientCoverage ? null : (
        <Alert>
          <Info />
          <AlertTitle>Interprete a nota junto com a cobertura</AlertTitle>
          <AlertDescription>
            A análise foi calculada, mas pelo menos um parâmetro ficou abaixo de{" "}
            {formatPercentage(dataCoverage.minimumRequiredPercentage)} de
            cobertura. Intervalos ausentes não recebem penalidade e podem tornar
            a nota mais otimista.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            <span className="flex items-center gap-2">
              <Bot className="size-4" />
              Resumo interpretativo
            </span>
          </CardTitle>
          <CardDescription>
            Texto auxiliar gerado a partir dos resultados determinísticos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap leading-relaxed">
            {analysis.aiSummary ??
              "Nenhum resumo interpretativo foi gerado para esta análise."}
          </p>
        </CardContent>
      </Card>

      <section aria-labelledby="charts-heading" className="space-y-3">
        <div>
          <h2 className="font-heading font-medium text-lg" id="charts-heading">
            Comparação dos parâmetros
          </h2>
          <p className="text-muted-foreground text-sm">
            Compare a qualidade calculada e a disponibilidade temporal dos
            dados.
          </p>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Notas por parâmetro</CardTitle>
              <CardDescription>Escala de adequação de 1 a 100.</CardDescription>
            </CardHeader>
            <CardContent>
              <AnalysisBarChart data={chartData} metric="score" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Cobertura por parâmetro</CardTitle>
              <CardDescription>
                Percentual da janela efetivamente coberto por medições.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AnalysisBarChart data={chartData} metric="coverage" />
            </CardContent>
          </Card>
        </div>
      </section>

      <section aria-labelledby="parameters-heading" className="space-y-3">
        <div>
          <h2
            className="font-heading font-medium text-lg"
            id="parameters-heading"
          >
            Detalhes por parâmetro
          </h2>
          <p className="text-muted-foreground text-sm">
            Estatísticas brutas, normalizadas e temporais usadas no cálculo.
          </p>
        </div>
        <div className="grid gap-4 2xl:grid-cols-2">
          {PARAMETER_CODES.map((parameterCode) => (
            <ParameterDetails
              coverage={dataCoverage.parameterCoverage[parameterCode]}
              key={parameterCode}
              measurements={measurementsByParameter[parameterCode]}
              parameterCode={parameterCode}
              score={parameterScores[parameterCode]}
              stats={analysis.metadata.parameterStats[parameterCode]}
              weight={analysis.metadata.parameterWeights[parameterCode]}
            />
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cobertura e período</CardTitle>
            <CardDescription>
              Janela solicitada, dados disponíveis e completude da análise.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <dl className="grid gap-4 sm:grid-cols-2">
              <DetailItem
                label="Início solicitado"
                value={formatDateTimeMed(timeRange.requestedStart)}
              />
              <DetailItem
                label="Fim solicitado"
                value={formatDateTimeMed(timeRange.requestedEnd)}
              />
              <DetailItem
                label="Primeira medição disponível"
                value={formatDateTimeMed(timeRange.actualStart)}
              />
              <DetailItem
                label="Última medição disponível"
                value={formatDateTimeMed(timeRange.actualEnd)}
              />
              <DetailItem
                label="Parâmetros presentes"
                value={presentParameters || "Nenhum"}
              />
              <DetailItem
                label="Parâmetros ausentes"
                value={missingParameters || "Nenhum"}
              />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <span className="flex items-center gap-2">
                <FlaskConical className="size-4" />
                Configuração do modelo
              </span>
            </CardTitle>
            <CardDescription>
              Parâmetros persistidos para auditoria e reprodução.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <DetailItem
                label="Versão do modelo"
                value={analysis.metadata.scoringModelVersion}
              />
              <DetailItem
                label="Convenção da janela"
                value={analysis.metadata.windowConvention}
              />
              <DetailItem
                label="Limiar crítico"
                value={formatDecimal(analysis.metadata.criticalThreshold)}
              />
              <DetailItem
                label="Cobertura mínima"
                value={formatPercentage(
                  analysis.metadata.minimumCoveragePercentage
                )}
              />
              <DetailItem
                label="Lacuna máxima de continuidade"
                value={formatDuration(
                  analysis.metadata.maximumContinuityGapSeconds
                )}
              />
              <DetailItem
                label="Cobertura suficiente"
                value={dataCoverage.hasSufficientCoverage ? "Sim" : "Não"}
              />
            </dl>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Intervalos desfavoráveis</CardTitle>
          <CardDescription>
            Períodos contíguos em que a pontuação normalizada ficou abaixo do
            limiar crítico.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {unfavorableIntervals.length > 0 ? (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead>Parâmetro</TableHead>
                    <TableHead>Início</TableHead>
                    <TableHead>Fim</TableHead>
                    <TableHead className="text-right">Duração</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unfavorableIntervals.map((interval) => (
                    <TableRow
                      key={`${interval.parameterCode}-${interval.start}-${interval.end}`}
                    >
                      <TableCell className="font-medium">
                        {PARAMETER_DEFINITIONS[interval.parameterCode].label}
                      </TableCell>
                      <TableCell>{formatDateTimeMed(interval.start)}</TableCell>
                      <TableCell>{formatDateTimeMed(interval.end)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDuration(interval.durationSeconds)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Nenhum intervalo desfavorável foi identificado.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
        <Badge variant={getScoreBadgeVariant(analysis.finalScore)}>
          Nota final {formatDecimal(analysis.finalScore)}
        </Badge>
        <span>Registro criado em {formatDateTimeMed(analysis.createdAt)}</span>
      </div>
    </article>
  );
}

export default async function AnalysisDetailsPage({
  params,
}: PageProps<"/analysis/[id]">) {
  const { id } = await params;
  const analysisId = Number(id);

  if (!Number.isSafeInteger(analysisId) || analysisId < 1) {
    notFound();
  }

  return (
    <Suspense fallback={<DetailsFallback />}>
      <AnalysisDetails analysisId={analysisId} />
    </Suspense>
  );
}
