import { formatDate } from "../../../utils/date";
import { ANALYSIS_SOURCE_PROTOCOL } from "../constants";
import type { AdvisorAnalysis } from "../repository/advisor-analyses";

const PARAMETER_DEFINITIONS = [
  {
    label: "Temperatura",
    scoreKey: "temperatureScore",
    statsKey: "temperature",
    unit: "°C",
  },
  {
    label: "pH",
    scoreKey: "phScore",
    statsKey: "ph",
    unit: null,
  },
  {
    label: "Salinidade",
    scoreKey: "salinityScore",
    statsKey: "salinity",
    unit: "ppt",
  },
  {
    label: "Oxigênio dissolvido",
    scoreKey: "dissolvedOxygenScore",
    statsKey: "dissolvedOxygen",
    unit: "mg/L",
  },
  {
    label: "Turbidez",
    scoreKey: "turbidityScore",
    statsKey: "turbidity",
    unit: "NTU",
  },
] as const;

export interface AdvisorSource {
  analysisCreatedAt: Date;
  analysisId: number;
  context: string;
  cycleId: number | null;
  periodEnd: Date;
  periodStart: Date;
  rank: number;
  similarity: number | null;
  sourceKey: string;
}

function formatValue(value: number, unit: string | null): string {
  const formattedValue = value.toFixed(2);
  return unit ? `${formattedValue} ${unit}` : formattedValue;
}

function formatParameter(
  analysis: AdvisorAnalysis,
  definition: (typeof PARAMETER_DEFINITIONS)[number],
  metadata: AdvisorAnalysis["metadata"]
): string {
  const score = analysis[definition.scoreKey];
  const rawValues = metadata?.parameterStats[definition.statsKey]?.rawValues;
  const details = [`pontuação ${score.toFixed(1)}/100`];

  if (!rawValues) {
    return `- ${definition.label}: ${details.join(", ")}`;
  }

  const { count, max, mean, min } = rawValues;
  if (mean !== null) {
    details.push(`média ${formatValue(mean, definition.unit)}`);
  }
  if (min !== null) {
    details.push(`mínimo ${formatValue(min, definition.unit)}`);
  }
  if (max !== null) {
    details.push(`máximo ${formatValue(max, definition.unit)}`);
  }
  details.push(`${count} medições`);

  return `- ${definition.label}: ${details.join(", ")}`;
}

export function formatAdvisorSourceTitle(source: AdvisorSource): string {
  const cycle = source.cycleId?.toString() ?? "não informado";

  return `Análise de ${formatDate(source.analysisCreatedAt)} | Período ${formatDate(source.periodStart)} a ${formatDate(source.periodEnd)} | Ciclo ${cycle}`;
}

export function createAdvisorSource(
  analysis: AdvisorAnalysis,
  rank: number,
  similarity: number | null
): AdvisorSource {
  const sourceKey = `${ANALYSIS_SOURCE_PROTOCOL.labelPrefix}${rank}`;
  const { metadata } = analysis;
  const cycle = analysis.cycleId?.toString() ?? "não informado";
  const parameterLines = PARAMETER_DEFINITIONS.map((definition) =>
    formatParameter(analysis, definition, metadata)
  );
  const context = [
    `[${sourceKey}]`,
    `Data de criação: ${formatDate(analysis.analysisCreatedAt)}`,
    `Período avaliado: ${formatDate(analysis.startTime)} a ${formatDate(analysis.endTime)}`,
    `Ciclo: ${cycle}`,
    `Pontuação geral: ${analysis.finalScore.toFixed(1)}/100`,
    "Parâmetros:",
    ...parameterLines,
  ].join("\n");

  return {
    analysisCreatedAt: analysis.analysisCreatedAt,
    analysisId: analysis.analysisId,
    context,
    cycleId: analysis.cycleId,
    periodEnd: analysis.endTime,
    periodStart: analysis.startTime,
    rank,
    similarity,
    sourceKey,
  };
}
