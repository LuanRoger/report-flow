import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import type { AnalysisDetails, ParameterCode } from "../../../actions/types";
import { PARAMETER_DEFINITIONS } from "../../../constants";
import {
  formatDecimal,
  formatDuration,
  formatPercentage,
} from "../../../format";

type ParameterStats =
  AnalysisDetails["metadata"]["parameterStats"][ParameterCode];
type ParameterCoverage =
  AnalysisDetails["metadata"]["executionStats"]["dataCoverage"]["parameterCoverage"][ParameterCode];

interface ParameterDetailsProps {
  coverage: ParameterCoverage;
  measurements: number;
  parameterCode: ParameterCode;
  score: number;
  stats: ParameterStats;
  weight: number;
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className="text-muted-foreground text-xs">{label}</dt>
    <dd className="font-medium tabular-nums">{value}</dd>
  </div>
);

const formatNullableValue = (value: number | null, unit?: string): string => {
  if (value === null) {
    return "—";
  }

  return `${formatDecimal(value)}${unit ? ` ${unit}` : ""}`;
};

export default function ParameterDetails({
  coverage,
  measurements,
  parameterCode,
  score,
  stats,
  weight,
}: ParameterDetailsProps) {
  const definition = PARAMETER_DEFINITIONS[parameterCode];
  const { normalizedScores, rawValues, temporalMetrics } = stats;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{definition.label}</CardTitle>
        <CardDescription>
          {measurements} {measurements === 1 ? "medição" : "medições"} · peso de{" "}
          {formatPercentage(weight * 100)}
        </CardDescription>
        <CardAction>
          <Badge variant={score >= 60 ? "default" : "destructive"}>
            Nota {formatDecimal(score)}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="text-muted-foreground">Cobertura temporal</span>
            <span className="font-medium tabular-nums">
              {formatPercentage(coverage.coveragePercentage)}
            </span>
          </div>
          <Progress
            aria-label={`Cobertura de ${definition.label}`}
            value={coverage.coveragePercentage}
          />
          <div className="flex justify-between gap-4 text-muted-foreground text-xs">
            <span>
              {formatDuration(coverage.coveredDurationSeconds)} cobertos
            </span>
            <span>
              {formatDuration(coverage.missingDurationSeconds)} ausentes
            </span>
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <h3 className="font-medium text-sm">Valores observados</h3>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="Mínimo"
              value={formatNullableValue(rawValues.min, definition.unit)}
            />
            <Stat
              label="Média"
              value={formatNullableValue(rawValues.mean, definition.unit)}
            />
            <Stat
              label="Máximo"
              value={formatNullableValue(rawValues.max, definition.unit)}
            />
            <Stat label="Amostras" value={rawValues.count.toString()} />
          </dl>
        </div>

        <div className="space-y-3">
          <h3 className="font-medium text-sm">Pontuação normalizada</h3>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat
              label="Mínimo"
              value={formatNullableValue(normalizedScores.min)}
            />
            <Stat
              label="Média"
              value={formatNullableValue(normalizedScores.mean)}
            />
            <Stat
              label="Máximo"
              value={formatNullableValue(normalizedScores.max)}
            />
            <Stat label="Amostras" value={normalizedScores.count.toString()} />
            <Stat
              label="Média temporal"
              value={formatDecimal(temporalMetrics.weightedMeanScore)}
            />
          </dl>
        </div>

        <div className="space-y-3">
          <h3 className="font-medium text-sm">Condições desfavoráveis</h3>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat
              label="Proporção"
              value={formatPercentage(temporalMetrics.pLow * 100)}
            />
            <Stat
              label="Duração"
              value={formatDuration(temporalMetrics.unfavorableDurationSeconds)}
            />
            <Stat
              label="Intervalos"
              value={temporalMetrics.unfavorableIntervals.length.toString()}
            />
          </dl>
        </div>
      </CardContent>
    </Card>
  );
}
