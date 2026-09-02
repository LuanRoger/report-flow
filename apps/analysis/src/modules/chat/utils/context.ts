import { formatDate } from "../../../utils/date";
import { metadataSchema } from "../../analysis/schemas";

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

export interface AdvisorAnalysis {
  analysisCreatedAt: Date;
  analysisId: number;
  cycleId: number | null;
  dissolvedOxygenScore: number;
  endTime: Date;
  finalScore: number;
  metadata: unknown;
  phScore: number;
  salinityScore: number;
  startTime: Date;
  temperatureScore: number;
  turbidityScore: number;
}

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

function parseMetadata(metadata: unknown) {
  let parsedMetadata = metadata;

  if (typeof metadata === "string") {
    try {
      parsedMetadata = JSON.parse(metadata);
    } catch {
      return;
    }
  }

  const result = metadataSchema.safeParse(parsedMetadata);
  return result.success ? result.data : undefined;
}

function formatValue(value: number, unit: string | null): string {
  const formattedValue = value.toFixed(2);
  return unit ? `${formattedValue} ${unit}` : formattedValue;
}

function formatParameter(
  analysis: AdvisorAnalysis,
  definition: (typeof PARAMETER_DEFINITIONS)[number],
  metadata: ReturnType<typeof parseMetadata>
): string {
  const score = analysis[definition.scoreKey];
  const rawValues = metadata?.parameterStats[definition.statsKey]?.rawValues;
  const details = [`pontuação ${score.toFixed(1)}/100`];

  if (typeof rawValues?.mean === "number") {
    details.push(`média ${formatValue(rawValues.mean, definition.unit)}`);
  }
  if (typeof rawValues?.min === "number") {
    details.push(`mínimo ${formatValue(rawValues.min, definition.unit)}`);
  }
  if (typeof rawValues?.max === "number") {
    details.push(`máximo ${formatValue(rawValues.max, definition.unit)}`);
  }
  if (typeof rawValues?.count === "number") {
    details.push(`${rawValues.count} medições`);
  }

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
  const sourceKey = `S${rank}`;
  const metadata = parseMetadata(analysis.metadata);
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
