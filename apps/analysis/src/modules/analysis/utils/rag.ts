import { openai } from "@ai-sdk/openai";
import { embed } from "ai";
import { formatDate } from "@/utils/date";
import { ANALYSIS_EMBEDDING_DIMENSIONS } from "../constants";
import type { ScoreResult } from "../schemas/types";
import type { UnfavorableInterval } from "../types/analysis";

function getScoreLabel(score: number): string {
  if (score >= 90) {
    return "Excellent";
  }
  if (score >= 80) {
    return "Very Good";
  }
  if (score >= 70) {
    return "Good";
  }
  if (score >= 60) {
    return "Fair";
  }
  if (score >= 40) {
    return "Poor";
  }
  if (score >= 20) {
    return "Very Poor";
  }
  return "Critical";
}

function formatUnfavorableIntervals(intervals: UnfavorableInterval[]): string {
  if (intervals.length === 0) {
    return "none";
  }

  return intervals
    .map(
      (interval) =>
        `${interval.start.toISOString()} to ${interval.end.toISOString()} (${interval.durationSeconds.toFixed(0)}s)`
    )
    .join("; ");
}

export function formatAnalysisForEmbedding(result: ScoreResult): string {
  const { aiSummary, finalScore, metadata, parameterScores, pondId } = result;
  const {
    criticalThreshold,
    executionStats,
    maximumContinuityGapSeconds,
    minimumCoveragePercentage,
    parameterStats,
    parameterWeights,
    scoringModelVersion,
    windowConvention,
  } = metadata;
  const { dataCoverage, timeRange, totalMeasurements } = executionStats;
  const parameterDescriptions: string[] = [];

  for (const parameterCode of Object.keys(parameterScores) as Array<
    keyof typeof parameterScores
  >) {
    const score = parameterScores[parameterCode];
    const stats = parameterStats[parameterCode];
    const temporal = stats.temporalMetrics;

    parameterDescriptions.push(
      `${parameterCode}: score=${score.toFixed(2)} (${getScoreLabel(score)}), ` +
        `rawMean=${stats.rawValues.mean?.toFixed(2) ?? "N/A"}, ` +
        `rawMin=${stats.rawValues.min?.toFixed(2) ?? "N/A"}, ` +
        `rawMax=${stats.rawValues.max?.toFixed(2) ?? "N/A"}, ` +
        `count=${stats.rawValues.count}, ` +
        `weightedMeanScore=${temporal.weightedMeanScore.toFixed(2)}, ` +
        `pLow=${temporal.pLow.toFixed(4)}, ` +
        `coverage=${temporal.coveragePercentage.toFixed(2)}%, ` +
        `coveredSeconds=${temporal.coveredDurationSeconds.toFixed(0)}, ` +
        `unfavorableSeconds=${temporal.unfavorableDurationSeconds.toFixed(0)}, ` +
        `unfavorableIntervals=${formatUnfavorableIntervals(temporal.unfavorableIntervals)}`
    );
  }

  const generatedInterpretation = aiSummary
    ? `\nGenerated interpretation:\n${aiSummary}\n`
    : "";

  return `
Pond Analysis: ${pondId}
Requested Period: ${formatDate(timeRange.requestedStart)} to ${formatDate(timeRange.requestedEnd)}
Actual Data: ${formatDate(timeRange.actualStart)} to ${formatDate(timeRange.actualEnd)}
Window Convention: ${windowConvention}

Overall Score: ${finalScore.toFixed(2)} (${getScoreLabel(finalScore)})
Total Measurements: ${totalMeasurements}
Overall Coverage: ${dataCoverage.coveragePercentage.toFixed(2)}%
Coverage Sufficient: ${dataCoverage.hasSufficientCoverage}
Minimum Coverage: ${minimumCoveragePercentage}%
Critical Threshold: ${criticalThreshold}

Parameters:
${parameterDescriptions.join("\n")}
${generatedInterpretation}
Configuration:
Scoring Model: ${scoringModelVersion}
Maximum Continuity Gap: ${maximumContinuityGapSeconds} seconds
Parameter Weights: Temperature=${parameterWeights.temperature}, pH=${parameterWeights.ph}, Salinity=${parameterWeights.salinity}, Dissolved Oxygen=${parameterWeights.dissolvedOxygen}
`;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.embeddingModel("text-embedding-3-small"),
    providerOptions: {
      openai: {
        dimensions: ANALYSIS_EMBEDDING_DIMENSIONS,
      },
    },
    value: text,
  });

  return embedding;
}
