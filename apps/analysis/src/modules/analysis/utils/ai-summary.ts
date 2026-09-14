import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { formatDate } from "@/utils/date";
import { AI_ANALYSIS_SUMMARY_SYSTEM_PROMPT } from "../constants";
import type { ScoreResult } from "../schemas/types";

function getScoreDescription(score: number): string {
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

function formatAnalysisContext(result: ScoreResult): string {
  const { endDate, finalScore, metadata, parameterScores, pondId, startDate } =
    result;
  const {
    criticalThreshold,
    executionStats,
    maximumContinuityGapSeconds,
    parameterStats,
    parameterWeights,
    scoringModelVersion,
  } = metadata;
  const { dataCoverage, timeRange, totalMeasurements } = executionStats;
  const parameterAnalysis: string[] = [];

  for (const parameterCode of Object.keys(parameterScores) as Array<
    keyof typeof parameterScores
  >) {
    const score = parameterScores[parameterCode];
    const temporal = parameterStats[parameterCode].temporalMetrics;
    const unfavorablePercentage = (temporal.pLow * 100).toFixed(1);

    parameterAnalysis.push(
      `${parameterCode}: ${score.toFixed(1)}/100 (${getScoreDescription(score)}), ` +
        `duration-weighted mean ${temporal.weightedMeanScore.toFixed(1)}, ` +
        `unfavorable time ${unfavorablePercentage}%, ` +
        `coverage ${temporal.coveragePercentage.toFixed(1)}%`
    );
  }

  return `
Analysis Context:
- Pond: ${pondId}
- Period: ${formatDate(startDate)} to ${formatDate(endDate)}
- Analysis Date Range: ${formatDate(timeRange.actualStart)} to ${formatDate(timeRange.actualEnd)}
- Total Measurements: ${totalMeasurements}
- Data Coverage: ${dataCoverage.coveragePercentage.toFixed(1)}%
- Coverage Sufficient: ${dataCoverage.hasSufficientCoverage}
- Overall Water Quality Score: ${finalScore.toFixed(1)}/100 (${getScoreDescription(finalScore)})
- Critical Threshold: ${criticalThreshold}/100

Parameter Performance:
${parameterAnalysis.join("\n")}

Configuration:
- Scoring Model: ${scoringModelVersion}
- Maximum Continuity Gap: ${maximumContinuityGapSeconds} seconds
- Parameter Weights: Temperature=${parameterWeights.temperature}, pH=${parameterWeights.ph}, Salinity=${parameterWeights.salinity}, Dissolved Oxygen=${parameterWeights.dissolvedOxygen}
`;
}

export async function generateAiSummary(result: ScoreResult): Promise<string> {
  const context = formatAnalysisContext(result);
  const { text } = await generateText({
    maxOutputTokens: 400,
    model: openai("gpt-4o-mini-2024-07-18"),
    prompt: `Please provide your professional analysis and advice for this pond:\n\n${context}\n\n`,
    system: AI_ANALYSIS_SUMMARY_SYSTEM_PROMPT,
  });

  return text;
}
